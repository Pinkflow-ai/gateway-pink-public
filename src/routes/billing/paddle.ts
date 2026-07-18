import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { PaddleCatalog, PaddleCreditPack } from '../../billing/paddle/catalog.js';
import { paddlePayloadHash, verifyPaddleSignature } from '../../billing/paddle/signature.js';
import type { PaddleBillingStore } from '../../billing/paddle/store.js';
import { principalForRequest } from '../../auth/types.js';
import { makeError } from '../../lib/errors.js';

interface CheckoutClient {
  createCheckout(pack: PaddleCreditPack, orgId: string): Promise<{
    transactionId: string;
    checkoutUrl: string;
  }>;
}

interface WebhookProcessor {
  process(rawBody: Buffer, payloadHash: string): Promise<{
    handled: boolean;
    duplicate?: boolean;
  }>;
}

export interface PaddleRouteDependencies {
  catalog: PaddleCatalog;
  client: CheckoutClient;
  store: PaddleBillingStore;
  processor: WebhookProcessor;
  webhookSecret: string;
  signatureToleranceSeconds: number;
  now?: () => number;
}

const checkoutBody = z.object({ pack_id: z.string().min(1).max(32) }).strict();

function privateResponse(reply: { header(name: string, value: string): unknown }): void {
  reply.header('Cache-Control', 'no-store, private');
}

export async function paddleBillingRoutes(
  app: FastifyInstance,
  dependencies: PaddleRouteDependencies,
): Promise<void> {
  app.post('/v1/billing/checkout', async (request, reply) => {
    privateResponse(reply);
    const parsed = checkoutBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send(makeError('bad_request', 'pack_id is required', request.id));
    }
    const pack = dependencies.catalog.byPackId(parsed.data.pack_id);
    if (!pack) {
      return reply.code(400).send(makeError('bad_request', 'unknown credit pack', request.id));
    }
    const principal = principalForRequest(request);
    let checkout: { transactionId: string; checkoutUrl: string };
    try {
      checkout = await dependencies.client.createCheckout(pack, principal.orgId);
      await dependencies.store.recordCheckoutIntent({
        orgId: principal.orgId,
        transactionId: checkout.transactionId,
        packId: pack.packId,
        priceId: pack.priceId,
        credits: pack.credits,
        grossCents: pack.subtotalCents,
        currency: pack.currency,
      });
    } catch {
      return reply.code(503).send(makeError(
        'checkout_unavailable', 'checkout is temporarily unavailable', request.id,
      ));
    }
    return reply.code(201).send({
      transaction_id: checkout.transactionId,
      checkout_url: checkout.checkoutUrl,
      pack_id: pack.packId,
      credits: pack.credits,
      subtotal_cents: pack.subtotalCents,
      currency: pack.currency,
    });
  });

  app.post('/webhooks/paddle', {
    config: { publicRoute: true, rawBody: true },
  }, async (request, reply) => {
    privateResponse(reply);
    const rawBody = request.rawBody;
    if (!Buffer.isBuffer(rawBody)) {
      return reply.code(400).send(makeError('bad_request', 'raw webhook body is unavailable', request.id));
    }
    const signature = typeof request.headers['paddle-signature'] === 'string'
      ? request.headers['paddle-signature']
      : undefined;
    if (!verifyPaddleSignature(
      rawBody,
      signature,
      dependencies.webhookSecret,
      (dependencies.now ?? Date.now)(),
      dependencies.signatureToleranceSeconds,
    )) {
      return reply.code(401).send(makeError('unauthorized', 'invalid webhook signature', request.id));
    }
    const result = await dependencies.processor.process(rawBody, paddlePayloadHash(rawBody));
    return reply.send({
      received: true,
      handled: result.handled,
      ...(result.duplicate === undefined ? {} : { duplicate: result.duplicate }),
    });
  });
}
