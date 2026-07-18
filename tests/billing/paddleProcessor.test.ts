import { describe, expect, it, vi } from 'vitest';
import { buildPaddleCatalog } from '../../src/billing/paddle/catalog.js';
import { PaddleWebhookProcessor } from '../../src/billing/paddle/processor.js';
import type { PaddleBillingStore } from '../../src/billing/paddle/store.js';
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

function store(overrides: Partial<PaddleBillingStore> = {}): PaddleBillingStore {
  return {
    checkoutIntentForTransaction: vi.fn(async () => ({
      orgId: 'org-1', transactionId: 'txn-1', packId: 'starter', priceId: 'pri_starter',
      credits: 10_000, grossCents: 1_106, currency: 'USD',
    })),
    recordCheckoutIntent: vi.fn(async () => undefined),
    purchaseForTransaction: vi.fn(async () => ({
      orgId: 'org-1', transactionId: 'txn-1', packId: 'starter', priceId: 'pri_starter',
      credits: 10_000, grossCents: 1_106, currency: 'USD', reversedCredits: 0,
    })),
    fulfill: vi.fn(async () => ({ balanceAfter: 10_000, debtAfter: 0, duplicate: false })),
    applyAdjustment: vi.fn(async () => ({ balanceAfter: 5_000, debtAfter: 0, duplicate: false })),
    reverseAdjustment: vi.fn(async () => ({ balanceAfter: 10_000, debtAfter: 0, duplicate: false })),
    findOriginalAdjustment: vi.fn(async () => 'adj-original'),
    ...overrides,
  };
}

function transactionEvent(overrides: Record<string, unknown> = {}): Buffer {
  return Buffer.from(JSON.stringify({
    event_id: 'evt-transaction',
    event_type: 'transaction.completed',
    data: {
      id: 'txn-1',
      status: 'completed',
      currency_code: 'USD',
      items: [{ quantity: 1, price: { id: 'pri_starter' } }],
      details: { totals: { subtotal: '1106', discount: '0' } },
      custom_data: {
        gateway_org_id: 'org-1',
        gateway_pack_id: 'starter',
        gateway_pricing_version: '2026-07-18-paddle-standard',
      },
      ...overrides,
    },
  }));
}

function adjustmentEvent(
  action: string,
  status = 'approved',
  eventType = 'adjustment.created',
  subtotal = '553',
): Buffer {
  return Buffer.from(JSON.stringify({
    event_id: `evt-${action}-${status}`,
    event_type: eventType,
    data: {
      id: `adj-${action}`,
      action,
      status,
      transaction_id: 'txn-1',
      currency_code: 'USD',
      totals: { subtotal, currency_code: 'USD' },
    },
  }));
}

describe('Paddle webhook processor', () => {
  it('fulfills a completed transaction only from the server catalog', async () => {
    const billing = store();
    const processor = new PaddleWebhookProcessor(buildPaddleCatalog(config), billing);
    await expect(processor.process(transactionEvent(), 'hash-1')).resolves.toEqual({
      handled: true, duplicate: false,
    });
    expect(billing.fulfill).toHaveBeenCalledWith({
      eventId: 'evt-transaction', eventType: 'transaction.completed', payloadHash: 'hash-1',
      transactionId: 'txn-1', orgId: 'org-1', packId: 'starter', priceId: 'pri_starter',
      credits: 10_000, grossCents: 1_106, currency: 'USD',
    });
  });

  it.each([
    [{ currency_code: 'EUR' }, 'currency'],
    [{ details: { totals: { subtotal: '1000', discount: '0' } } }, 'subtotal'],
    [{ details: { totals: { subtotal: '1106', discount: '1' } } }, 'discount'],
    [{ items: [{ quantity: 1, price: { id: 'pri_growth' } }] }, 'pack'],
    [{ custom_data: { gateway_org_id: 'org-attacker', gateway_pack_id: 'starter', gateway_pricing_version: '2026-07-18-paddle-standard' } }, 'organization'],
    [{ custom_data: { gateway_org_id: 'org-1', gateway_pack_id: 'starter', gateway_pricing_version: 'old' } }, 'pricing version'],
  ])('rejects a completed transaction with mismatched %s data', async (overrides, expected) => {
    const processor = new PaddleWebhookProcessor(buildPaddleCatalog(config), store());
    await expect(processor.process(transactionEvent(overrides), 'hash-1')).rejects.toThrow(expected);
  });

  it('applies only approved economic adjustments using the pre-tax subtotal', async () => {
    const billing = store();
    const processor = new PaddleWebhookProcessor(buildPaddleCatalog(config), billing);
    await expect(processor.process(adjustmentEvent('refund', 'pending_approval'), 'hash-pending'))
      .resolves.toEqual({ handled: false });
    await expect(processor.process(
      adjustmentEvent('refund', 'approved', 'adjustment.updated'),
      'hash-approved',
    )).resolves.toEqual({ handled: true, duplicate: false });
    expect(billing.applyAdjustment).toHaveBeenCalledWith(expect.objectContaining({
      action: 'refund', credits: 5_000, transactionId: 'txn-1', payloadHash: 'hash-approved',
    }));
  });

  it('matches an approved reversal to the original adjustment by transaction, action, and credits', async () => {
    const billing = store();
    const processor = new PaddleWebhookProcessor(buildPaddleCatalog(config), billing);
    await expect(processor.process(
      adjustmentEvent('chargeback_warning_reverse', 'approved', 'adjustment.created', '-553'),
      'hash-reverse',
    )).resolves.toEqual({ handled: true, duplicate: false });
    expect(billing.findOriginalAdjustment).toHaveBeenCalledWith(
      'txn-1', 'chargeback_warning_reverse', 5_000,
    );
    expect(billing.reverseAdjustment).toHaveBeenCalledWith(expect.objectContaining({
      action: 'chargeback_warning_reverse', originalAdjustmentId: 'adj-original',
    }));
  });

  it('ignores unknown events and tax-only adjustments but rejects an unmatched reversal', async () => {
    const billing = store({ findOriginalAdjustment: vi.fn(async () => null) });
    const processor = new PaddleWebhookProcessor(buildPaddleCatalog(config), billing);
    await expect(processor.process(Buffer.from(JSON.stringify({
      event_id: 'evt-customer', event_type: 'customer.created', data: {},
    })), 'hash')).resolves.toEqual({ handled: false });
    await expect(processor.process(adjustmentEvent('refund', 'approved', 'adjustment.updated', '0'), 'hash'))
      .resolves.toEqual({ handled: false });
    await expect(processor.process(
      adjustmentEvent('credit_reverse', 'approved', 'adjustment.created', '-553'), 'hash',
    )).rejects.toThrow('original adjustment');
  });
});
