import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { buildApp } from '../../src/app.js';
import { buildPaddleCatalog } from '../../src/billing/paddle/catalog.js';
import type { PaddleBillingStore } from '../../src/billing/paddle/store.js';
import { parseConfig } from '../../src/config.js';

const paddleConfig = parseConfig({
  CHECKOUT_MODE: 'paddle',
  BILLING_MODE: 'postgres',
  DATABASE_URL: 'postgresql://db/gateway',
  PADDLE_API_KEY: 'pdl_test_secret',
  PADDLE_WEBHOOK_SECRET: 'notification-secret',
  PADDLE_CHECKOUT_URL: 'https://gateway.pink/checkout',
  PADDLE_PRICE_STARTER: 'pri_starter',
  PADDLE_PRICE_STANDARD: 'pri_standard',
  PADDLE_PRICE_GROWTH: 'pri_growth',
  PADDLE_PRICE_SCALE: 'pri_scale',
});

function dependencies() {
  const store = {
    recordCheckoutIntent: vi.fn(async () => undefined),
    checkoutIntentForTransaction: vi.fn(),
    purchaseForTransaction: vi.fn(),
    fulfill: vi.fn(),
    applyAdjustment: vi.fn(),
    reverseAdjustment: vi.fn(),
    findOriginalAdjustment: vi.fn(),
  } as unknown as PaddleBillingStore;
  return {
    catalog: buildPaddleCatalog(paddleConfig),
    client: {
      createCheckout: vi.fn(async () => ({
        transactionId: 'txn-1', checkoutUrl: 'https://checkout.paddle.com/txn-1',
      })),
    },
    store,
    processor: { process: vi.fn(async () => ({ handled: true, duplicate: false })) },
    webhookSecret: 'notification-secret',
    signatureToleranceSeconds: 5,
    now: () => 1_721_299_200_000,
  };
}

describe('Paddle billing routes', () => {
  it('creates and records an authenticated checkout intent before returning the URL', async () => {
    const paddle = dependencies();
    const app = await buildApp({
      authenticator: { authenticate: vi.fn(async (token) => token === 'gp_live' ? {
        apiKeyId: 'key-1', orgId: 'org-1', mcpEnabled: false,
      } : null) },
      paddleDependencies: paddle,
    });
    const unauthorized = await app.inject({ method: 'POST', url: '/v1/billing/checkout', payload: { pack_id: 'starter' } });
    expect(unauthorized.statusCode).toBe(401);

    const response = await app.inject({
      method: 'POST', url: '/v1/billing/checkout',
      headers: { authorization: 'Bearer gp_live' }, payload: { pack_id: 'starter' },
    });
    expect(response.statusCode).toBe(201);
    expect(response.headers['cache-control']).toContain('no-store');
    expect(response.json()).toEqual({
      transaction_id: 'txn-1',
      checkout_url: 'https://checkout.paddle.com/txn-1',
      pack_id: 'starter',
      credits: 10_000,
      subtotal_cents: 1_106,
      currency: 'USD',
    });
    expect(paddle.client.createCheckout).toHaveBeenCalledWith(
      expect.objectContaining({ packId: 'starter', credits: 10_000 }), 'org-1',
    );
    expect(paddle.store.recordCheckoutIntent).toHaveBeenCalledWith({
      orgId: 'org-1', transactionId: 'txn-1', packId: 'starter', priceId: 'pri_starter',
      credits: 10_000, grossCents: 1_106, currency: 'USD',
    });
    await app.close();
  });

  it('rejects an unknown client pack without calling Paddle', async () => {
    const paddle = dependencies();
    const app = await buildApp({ paddleDependencies: paddle });
    const response = await app.inject({
      method: 'POST', url: '/v1/billing/checkout', payload: { pack_id: 'made-up' },
    });
    expect(response.statusCode).toBe(400);
    expect(paddle.client.createCheckout).not.toHaveBeenCalled();
    await app.close();
  });

  it('returns a sanitized service-unavailable response when checkout creation fails', async () => {
    const paddle = dependencies();
    paddle.client.createCheckout.mockRejectedValue(new Error('secret Paddle response'));
    const app = await buildApp({
      paddleDependencies: paddle,
      authenticator: { authenticate: vi.fn(async () => ({
        apiKeyId: 'key-1', orgId: 'org-1', mcpEnabled: false,
      })) },
    });
    const response = await app.inject({
      method: 'POST', url: '/v1/billing/checkout',
      headers: { authorization: 'Bearer gp_live' }, payload: { pack_id: 'starter' },
    });
    expect(response.statusCode).toBe(503);
    expect(response.body).not.toContain('secret Paddle response');
    expect(response.json()).toMatchObject({
      error: { code: 'checkout_unavailable', message: 'checkout is temporarily unavailable' },
    });
    await app.close();
  });

  it('verifies the public webhook against the exact raw body before processing', async () => {
    const paddle = dependencies();
    const app = await buildApp({
      authenticator: { authenticate: vi.fn(async () => null) },
      paddleDependencies: paddle,
    });
    const raw = '{"event_id":"evt-1", "event_type":"transaction.completed","data":{}}';
    const timestamp = 1_721_299_200;
    const signature = createHmac('sha256', 'notification-secret')
      .update(`${timestamp}:${raw}`).digest('hex');
    const response = await app.inject({
      method: 'POST', url: '/webhooks/paddle',
      headers: { 'content-type': 'application/json', 'paddle-signature': `ts=${timestamp};h1=${signature}` },
      payload: raw,
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toContain('no-store');
    expect(response.json()).toEqual({ received: true, handled: true, duplicate: false });
    expect(paddle.processor.process).toHaveBeenCalledWith(Buffer.from(raw), expect.stringMatching(/^[a-f0-9]{64}$/));
    await app.close();
  });

  it('rejects an invalid webhook signature before billing mutation', async () => {
    const paddle = dependencies();
    const app = await buildApp({ paddleDependencies: paddle });
    const response = await app.inject({
      method: 'POST', url: '/webhooks/paddle',
      headers: { 'content-type': 'application/json', 'paddle-signature': 'ts=1;h1=bad' },
      payload: '{}',
    });
    expect(response.statusCode).toBe(401);
    expect(paddle.processor.process).not.toHaveBeenCalled();
    await app.close();
  });
});
