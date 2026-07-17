import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  type Provider,
  type ProviderContext,
  type ProviderResult,
} from '../providers/_registry.js';
import { ERROR_STATUS, makeError, toUnexpectedError } from './errors.js';
import { requestLogger } from '../log.js';
import { config } from '../config.js';
import { policyFor } from '../policy/registry.js';

/**
 * The shared hot path every route runs. Stays out of the payload: input is
 * passed straight to the provider, the response is sent, and only operational
 * metadata (request_id, endpoint, status, latency) is logged.
 *
 * `payloadRoute` is the route key (e.g. 'POST /v1/compute/hash') used to look
 * up the storage policy and set the X-Gateway-* headers.
 */
export async function runProvider<Req, Res>(
  req: FastifyRequest,
  reply: FastifyReply,
  payloadRoute: string,
  provider: Provider<Req, Res>,
  input: Req,
): Promise<void> {
  const requestId = req.id;
  const log = requestLogger(requestId);
  const started = Date.now();
  const endpoint = payloadRoute;

  const ctx: ProviderContext = {
    requestId,
    timeoutMs: config.upstreamTimeoutMs,
    userAgent: config.upstreamUserAgent,
  };

  // Storage-policy headers — proof #2 on the trust page.
  const policy = policyFor(payloadRoute);
  if (policy) {
    reply.header('X-Gateway-Storage-Policy', policy.storagePolicy);
    if (policy.storagePolicy === 'none') {
      reply.header('X-Gateway-No-Store', 'true');
    }
  }
  reply.header('X-Request-Id', requestId);

  let result: ProviderResult<Res>;
  try {
    result = await provider.execute(input, ctx);
  } catch (err) {
    // Providers should never throw for expected upstream errors. If one does,
    // it's our bug — log it (no payload, just the error message) and 500.
    const envelope = toUnexpectedError(err, requestId);
    log.error({ endpoint, status: 500, latency_ms: Date.now() - started, err: envelope.error.code });
    reply.code(500).send(envelope);
    return;
  }

  const latencyMs = Date.now() - started;

  if (result.ok) {
    log.info({ endpoint, status: 200, latency_ms: latencyMs });
    reply.code(200).send({ data: result.data, _source: provider.source });
    return;
  }

  const status = ERROR_STATUS[result.error.code] ?? 502;
  log.warn({ endpoint, status, latency_ms: latencyMs, err: result.error.code });
  reply.code(status).send(makeError(result.error.code, result.error.message, requestId));
}
