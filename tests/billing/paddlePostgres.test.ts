import { describe, expect, it, vi } from 'vitest';
import { PostgresPaddleBillingStore } from '../../src/billing/paddle/postgres.js';

function querySequence(...results: Array<{ rows: unknown[]; rowCount?: number }>) {
  return vi.fn(async () => {
    const result = results.shift() ?? { rows: [] };
    return { ...result, rowCount: result.rowCount ?? result.rows.length };
  });
}

describe('Postgres Paddle billing store', () => {
  it('records and reloads the server-owned checkout intent', async () => {
    const query = querySequence(
      { rows: [] },
      { rows: [{
        org_id: 'org-1', transaction_id: 'txn-1', pack_id: 'starter', price_id: 'pri_starter',
        credits: 10_000, gross_cents: 1_106, currency: 'USD',
      }] },
    );
    const store = new PostgresPaddleBillingStore({ query });
    const intent = {
      orgId: 'org-1', transactionId: 'txn-1', packId: 'starter', priceId: 'pri_starter',
      credits: 10_000, grossCents: 1_106, currency: 'USD',
    };
    await store.recordCheckoutIntent(intent);
    await expect(store.checkoutIntentForTransaction('txn-1')).resolves.toEqual(intent);
    expect(query.mock.calls[0]?.[0]).toContain('insert into billing_checkout_intents');
    expect(query.mock.calls[0]?.[1]).toEqual([
      'txn-1', 'org-1', 'starter', 'pri_starter', 10_000, 1_106, 'USD',
    ]);
  });

  it('loads a server-recorded purchase by transaction', async () => {
    const query = querySequence({ rows: [{
      org_id: 'org-1', transaction_id: 'txn-1', pack_id: 'starter', price_id: 'pri_starter',
      credits: 10_000, gross_cents: 1_106, currency: 'USD', reversed_credits: 0,
    }] });
    const store = new PostgresPaddleBillingStore({ query });
    await expect(store.purchaseForTransaction('txn-1')).resolves.toMatchObject({
      orgId: 'org-1', packId: 'starter', priceId: 'pri_starter', credits: 10_000,
    });
    expect(query.mock.calls[0]?.[0]).toContain('from billing_purchases');
    expect(query.mock.calls[0]?.[1]).toEqual(['txn-1']);
  });

  it('calls the atomic fulfillment and adjustment functions with immutable event metadata', async () => {
    const query = querySequence(
      { rows: [{ balance_after: 10_000, debt_after: 0, duplicate: false }] },
      { rows: [{ balance_after: 5_000, debt_after: 0, credits_reversed: 5_000, duplicate: false }] },
      { rows: [{ balance_after: 10_000, debt_after: 0, credits_restored: 5_000, duplicate: false }] },
    );
    const store = new PostgresPaddleBillingStore({ query });
    await store.fulfill({
      eventId: 'evt-1', eventType: 'transaction.completed', payloadHash: 'hash-1',
      transactionId: 'txn-1', orgId: 'org-1', packId: 'starter', priceId: 'pri_starter',
      credits: 10_000, grossCents: 1_106, currency: 'USD',
    });
    await store.applyAdjustment({
      eventId: 'evt-2', eventType: 'adjustment.updated', payloadHash: 'hash-2',
      adjustmentId: 'adj-1', transactionId: 'txn-1', action: 'refund', credits: 5_000,
    });
    await store.reverseAdjustment({
      eventId: 'evt-3', eventType: 'adjustment.created', payloadHash: 'hash-3',
      adjustmentId: 'adj-2', originalAdjustmentId: 'adj-1', action: 'credit_reverse',
    });
    expect(query.mock.calls[0]?.[0]).toContain('fulfill_paddle_purchase');
    expect(query.mock.calls[0]?.[1]).toEqual([
      'evt-1', 'transaction.completed', 'hash-1', 'txn-1', 'org-1', 'starter',
      'pri_starter', 10_000, 1_106, 'USD',
    ]);
    expect(query.mock.calls[1]?.[0]).toContain('apply_paddle_adjustment');
    expect(query.mock.calls[2]?.[0]).toContain('reverse_paddle_adjustment');
  });

  it('finds the matching unreversed economic adjustment for a reversal event', async () => {
    const query = querySequence({ rows: [{ adjustment_id: 'adj-original' }] });
    const store = new PostgresPaddleBillingStore({ query });
    await expect(store.findOriginalAdjustment('txn-1', 'chargeback_warning_reverse', 5_000))
      .resolves.toBe('adj-original');
    expect(query.mock.calls[0]?.[1]).toEqual(['txn-1', 'chargeback_warning', 5_000]);
    await expect(new PostgresPaddleBillingStore({ query: querySequence({ rows: [] }) })
      .findOriginalAdjustment('txn-1', 'credit_reverse', 5_000)).resolves.toBeNull();
  });
});
