import { describe, expect, it, vi } from 'vitest';
import { buildPaddleCatalog } from '../../src/billing/paddle/catalog.js';
import { PaddleClient } from '../../src/billing/paddle/client.js';
import { parseConfig } from '../../src/config.js';

const config = parseConfig({
  CHECKOUT_MODE: 'paddle',
  BILLING_MODE: 'postgres',
  DATABASE_URL: 'postgresql://db/gateway',
  PADDLE_ENVIRONMENT: 'sandbox',
  PADDLE_API_KEY: 'pdl_test_secret',
  PADDLE_WEBHOOK_SECRET: 'notification-secret',
  PADDLE_CHECKOUT_URL: 'https://gateway.pink/checkout',
  PADDLE_PRICE_STARTER: 'pri_starter',
  PADDLE_PRICE_STANDARD: 'pri_standard',
  PADDLE_PRICE_GROWTH: 'pri_growth',
  PADDLE_PRICE_SCALE: 'pri_scale',
});

describe('Paddle checkout client', () => {
  it('creates a hosted transaction from server-owned pack metadata', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      data: { id: 'txn_example', checkout: { url: 'https://sandbox-checkout.paddle.com/txn_example' } },
    }), { status: 201, headers: { 'content-type': 'application/json' } }));
    const client = new PaddleClient(config, fetcher);
    const pack = buildPaddleCatalog(config).byPackId('starter')!;

    await expect(client.createCheckout(pack, 'org-123')).resolves.toEqual({
      transactionId: 'txn_example',
      checkoutUrl: 'https://sandbox-checkout.paddle.com/txn_example',
    });
    expect(fetcher).toHaveBeenCalledOnce();
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe('https://sandbox-api.paddle.com/transactions');
    expect(init?.headers).toMatchObject({ Authorization: 'Bearer pdl_test_secret' });
    expect(JSON.parse(String(init?.body))).toEqual({
      items: [{ price_id: 'pri_starter', quantity: 1 }],
      custom_data: {
        gateway_org_id: 'org-123',
        gateway_pack_id: 'starter',
        gateway_pricing_version: '2026-07-18-paddle-standard',
      },
      checkout: { url: 'https://gateway.pink/checkout' },
    });
  });

  it('fails closed on Paddle errors or an unsafe checkout URL', async () => {
    const failed = new PaddleClient(config, async () => new Response('{}', { status: 503 }));
    await expect(failed.createCheckout(buildPaddleCatalog(config).packs[0]!, 'org-123'))
      .rejects.toThrow('Paddle checkout is unavailable');

    const unsafe = new PaddleClient(config, async () => new Response(JSON.stringify({
      data: { id: 'txn_example', checkout: { url: 'javascript:alert(1)' } },
    }), { status: 201, headers: { 'content-type': 'application/json' } }));
    await expect(unsafe.createCheckout(buildPaddleCatalog(config).packs[0]!, 'org-123'))
      .rejects.toThrow('Paddle returned an invalid checkout');
  });
});
