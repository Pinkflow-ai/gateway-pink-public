import { describe, expect, it } from 'vitest';
import { MemoryUsageMeter } from '../../src/billing/memory.js';
import { creditsForProviderCost, estimateMeteredCredits } from '../../src/billing/pricing.js';

const identity = { orgId: 'org-dev', apiKeyId: 'key-dev' };
const successfulUsage = { httpStatus: 200, durationMs: 1 };

describe('in-memory usage meter', () => {
  it('holds credits atomically and refunds the unused reservation on settlement', async () => {
    const meter = new MemoryUsageMeter(20);
    const reserved = await meter.reserve(identity, 'request-1', 'POST /v1/ai/summarize', 10, 'fingerprint-1');
    expect(reserved).toMatchObject({ ok: true, availableCredits: 10 });
    if (!reserved.ok) throw new Error(reserved.reason);

    expect(await meter.reserve(identity, 'request-2', 'POST /v1/ai/summarize', 11, 'fingerprint-2')).toEqual({
      ok: false,
      reason: 'insufficient_credits',
      availableCredits: 10,
    });

    const usage = {
      actualCredits: 4,
      ...successfulUsage,
      inputTokens: 10,
      outputTokens: 5,
      upstreamCostMicros: 2_000,
    };
    await meter.prepare(reserved.reservation, usage);
    const settled = await meter.settle(reserved.reservation, usage);
    expect(settled).toEqual({ creditsCharged: 4, balanceAfter: 16, providerPriceOverrun: false });
  });

  it('charges zero when a reservation is released after failure', async () => {
    const meter = new MemoryUsageMeter(20);
    const reserved = await meter.reserve(identity, 'request-1', 'POST /v1/email/validate', 17, 'fingerprint-1');
    if (!reserved.ok) throw new Error(reserved.reason);
    expect(await meter.release(reserved.reservation, { httpStatus: 502, durationMs: 1 })).toEqual({ balanceAfter: 20 });
  });

  it('rejects replay of a non-active internal request before an upstream can run again', async () => {
    const meter = new MemoryUsageMeter(20);
    const reserved = await meter.reserve(identity, 'request-1', 'POST /v1/email/validate', 17, 'fingerprint-1');
    if (!reserved.ok) throw new Error(reserved.reason);
    await meter.prepare(reserved.reservation, { actualCredits: 17, ...successfulUsage });
    await meter.settle(reserved.reservation, { actualCredits: 17, ...successfulUsage });

    expect(await meter.reserve(identity, 'request-1', 'POST /v1/email/validate', 17, 'fingerprint-1')).toEqual({
      ok: false,
      reason: 'request_already_settled',
      availableCredits: 3,
    });
  });

  it('distinguishes active, pending, released, and fingerprint mismatch reuse', async () => {
    const meter = new MemoryUsageMeter(50);
    const active = await meter.reserve(identity, 'request-1', 'POST /v1/email/validate', 17, 'fingerprint-1');
    if (!active.ok) throw new Error(active.reason);
    expect(await meter.reserve(identity, 'request-1', 'POST /v1/email/validate', 17, 'fingerprint-1'))
      .toMatchObject({ ok: false, reason: 'request_in_progress' });
    expect(await meter.reserve(identity, 'request-1', 'POST /v1/email/validate', 17, 'different'))
      .toMatchObject({ ok: false, reason: 'idempotency_mismatch' });
    await meter.prepare(active.reservation, { actualCredits: 17, ...successfulUsage });
    expect(await meter.reserve(identity, 'request-1', 'POST /v1/email/validate', 17, 'fingerprint-1'))
      .toMatchObject({ ok: false, reason: 'billing_unknown' });

    const released = await meter.reserve(identity, 'request-2', 'POST /v1/email/validate', 17, 'fingerprint-2');
    if (!released.ok) throw new Error(released.reason);
    await meter.release(released.reservation, { httpStatus: 502, durationMs: 1 });
    expect(await meter.reserve(identity, 'request-2', 'POST /v1/email/validate', 17, 'fingerprint-2'))
      .toMatchObject({ ok: false, reason: 'request_already_failed' });
  });

  it('caps an unexpected price overrun and disables that route', async () => {
    const meter = new MemoryUsageMeter(100);
    const reserved = await meter.reserve(identity, 'request-1', 'POST /v1/ai/summarize', 10, 'fingerprint-1');
    if (!reserved.ok) throw new Error(reserved.reason);
    const usage = {
      actualCredits: 12,
      ...successfulUsage,
      inputTokens: 1,
      outputTokens: 1,
      upstreamCostMicros: 12_000,
    };
    await meter.prepare(reserved.reservation, usage);
    expect(await meter.settle(reserved.reservation, usage)).toEqual({ creditsCharged: 10, balanceAfter: 90, providerPriceOverrun: true });
    expect(await meter.reserve(identity, 'request-2', 'POST /v1/ai/summarize', 1, 'fingerprint-2')).toEqual({
      ok: false,
      reason: 'route_disabled',
      availableCredits: 90,
    });
    expect(await meter.reserve(identity, 'request-1', 'POST /v1/ai/summarize', 10, 'fingerprint-1'))
      .toMatchObject({ ok: false, reason: 'request_already_settled' });
  });
});

describe('metered pricing math', () => {
  const pricing = {
    kind: 'metered' as const,
    unit: 'provider-cost' as const,
    provider: 'openrouter' as const,
    model: 'google/gemini-2.5-flash-lite',
    promptUsdMicrosPerMillionTokens: 100_000,
    completionUsdMicrosPerMillionTokens: 400_000,
    maxInputCharacters: 50_000,
    maxOutputTokens: 1_024,
    minimumCredits: 1,
    reserveCredits: 100,
    targetMarginBps: 8_000,
    providerFeeBps: 550,
  };

  it('applies the provider fee and margin using integer microdollars', () => {
    expect(creditsForProviderCost(1_000, pricing)).toBe(6);
  });

  it('uses UTF-8 bytes as a conservative input-token ceiling for preflight', () => {
    const ascii = estimateMeteredCredits('hello', pricing);
    const unicode = estimateMeteredCredits('🚀'.repeat(10_000), pricing);
    const maximumBytesWithinCharacterLimit = '\u0800'.repeat(50_000);
    expect(ascii).toBeGreaterThanOrEqual(1);
    expect(unicode).toBeGreaterThan(ascii);
    expect(estimateMeteredCredits('x'.repeat(50_000), pricing)).toBeLessThanOrEqual(100);
    expect(maximumBytesWithinCharacterLimit).toHaveLength(50_000);
    expect(estimateMeteredCredits(maximumBytesWithinCharacterLimit, pricing)).toBeLessThanOrEqual(
      pricing.reserveCredits,
    );
  });

  it('prices preflight from the output cap declared on the request', () => {
    const text = 'x'.repeat(50_000);
    expect(estimateMeteredCredits(text, pricing, 32)).toBeLessThan(
      estimateMeteredCredits(text, pricing, 1_024),
    );
  });
});
