import { describe, expect, it } from 'vitest';
import { MemoryUsageMeter } from '../../src/billing/memory.js';
import { creditsForProviderCost, estimateMeteredCredits } from '../../src/billing/pricing.js';

describe('in-memory usage meter', () => {
  it('holds credits atomically and refunds the unused reservation on settlement', async () => {
    const meter = new MemoryUsageMeter(20);
    const reserved = await meter.reserve('org-dev', 'request-1', 'POST /v1/ai/summarize', 10);
    expect(reserved).toMatchObject({ ok: true, availableCredits: 10 });
    if (!reserved.ok) throw new Error(reserved.reason);

    expect(await meter.reserve('org-dev', 'request-2', 'POST /v1/ai/summarize', 11)).toEqual({
      ok: false,
      reason: 'insufficient_credits',
      availableCredits: 10,
    });

    const settled = await meter.settle(reserved.reservation, {
      actualCredits: 4,
      inputTokens: 10,
      outputTokens: 5,
      upstreamCostMicros: 2_000,
    });
    expect(settled).toEqual({ creditsCharged: 4, balanceAfter: 16, providerPriceOverrun: false });
  });

  it('charges zero when a reservation is released after failure', async () => {
    const meter = new MemoryUsageMeter(10);
    const reserved = await meter.reserve('org-dev', 'request-1', 'POST /v1/email/validate', 6);
    if (!reserved.ok) throw new Error(reserved.reason);
    expect(await meter.release(reserved.reservation)).toEqual({ balanceAfter: 10 });
  });

  it('rejects replay of a non-active internal request before an upstream can run again', async () => {
    const meter = new MemoryUsageMeter(10);
    const reserved = await meter.reserve('org-dev', 'request-1', 'POST /v1/email/validate', 6);
    if (!reserved.ok) throw new Error(reserved.reason);
    await meter.settle(reserved.reservation, { actualCredits: 6 });

    expect(await meter.reserve('org-dev', 'request-1', 'POST /v1/email/validate', 6)).toEqual({
      ok: false,
      reason: 'billing_conflict',
      availableCredits: 4,
    });
  });

  it('caps an unexpected price overrun and disables that route', async () => {
    const meter = new MemoryUsageMeter(100);
    const reserved = await meter.reserve('org-dev', 'request-1', 'POST /v1/ai/summarize', 10);
    if (!reserved.ok) throw new Error(reserved.reason);
    expect(await meter.settle(reserved.reservation, {
      actualCredits: 12,
      inputTokens: 1,
      outputTokens: 1,
      upstreamCostMicros: 12_000,
    })).toEqual({ creditsCharged: 10, balanceAfter: 90, providerPriceOverrun: true });
    expect(await meter.reserve('org-dev', 'request-2', 'POST /v1/ai/summarize', 1)).toEqual({
      ok: false,
      reason: 'route_disabled',
      availableCredits: 90,
    });
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
    targetMarginBps: 2_000,
    providerFeeBps: 550,
  };

  it('applies the provider fee and margin using integer microdollars', () => {
    expect(creditsForProviderCost(1_000, pricing)).toBe(2);
  });

  it('uses UTF-8 bytes as a conservative input-token ceiling for preflight', () => {
    const ascii = estimateMeteredCredits('hello', pricing);
    const unicode = estimateMeteredCredits('🚀'.repeat(10_000), pricing);
    expect(ascii).toBeGreaterThanOrEqual(1);
    expect(unicode).toBeGreaterThan(ascii);
    expect(estimateMeteredCredits('x'.repeat(50_000), pricing)).toBeLessThanOrEqual(100);
  });

  it('prices preflight from the output cap declared on the request', () => {
    const text = 'x'.repeat(50_000);
    expect(estimateMeteredCredits(text, pricing, 32)).toBeLessThan(
      estimateMeteredCredits(text, pricing, 1_024),
    );
  });
});
