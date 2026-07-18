import { describe, expect, it } from 'vitest';
import { buildPaddleCatalog, creditsForAdjustment } from '../../src/billing/paddle/catalog.js';
import { parseConfig } from '../../src/config.js';

const config = parseConfig({
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

describe('Paddle credit pack catalog', () => {
  it('owns credit quantities and fee-inclusive USD subtotals on the server', () => {
    const catalog = buildPaddleCatalog(config);
    expect(catalog.byPackId('starter')).toMatchObject({
      packId: 'starter', priceId: 'pri_starter', credits: 10_000, subtotalCents: 1_106,
    });
    expect(catalog.byPackId('standard')).toMatchObject({ credits: 50_000, subtotalCents: 5_316 });
    expect(catalog.byPackId('growth')).toMatchObject({ credits: 100_000, subtotalCents: 10_579 });
    expect(catalog.byPackId('scale')).toMatchObject({ credits: 500_000, subtotalCents: 52_685 });
    expect(catalog.byPriceId('pri_growth')?.packId).toBe('growth');
    expect(catalog.byPackId('unknown')).toBeNull();
  });

  it('converts a partial pre-tax adjustment to a capped proportional credit reversal', () => {
    const pack = buildPaddleCatalog(config).byPackId('starter');
    expect(pack).not.toBeNull();
    expect(creditsForAdjustment(pack!, 1_106)).toBe(10_000);
    expect(creditsForAdjustment(pack!, 553)).toBe(5_000);
    expect(creditsForAdjustment(pack!, 1)).toBe(10);
    expect(creditsForAdjustment(pack!, 0)).toBe(0);
    expect(creditsForAdjustment(pack!, 2_000)).toBe(10_000);
  });
});
