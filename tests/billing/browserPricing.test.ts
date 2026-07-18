import { describe, expect, it } from 'vitest';
import { creditsForBrowserTime, directCostForBrowserTime } from '../../src/billing/pricing.js';

const pricing = {
  kind: 'metered' as const,
  unit: 'browser-time' as const,
  provider: 'cloudflare-browser-rendering' as const,
  browserUsdMicrosPerHour: 90_000 as const,
  baseCostMicros: 200 as const,
  maximumBrowserMs: 40_000,
  minimumCredits: 1 as const,
  reserveCredits: 6,
  targetMarginBps: 8_000 as const,
};

describe('browser-time pricing', () => {
  it('uses exact integer Cloudflare cost and 80% margin formulas', () => {
    expect(directCostForBrowserTime(0, pricing)).toBe(200);
    expect(directCostForBrowserTime(1, pricing)).toBe(201);
    expect(directCostForBrowserTime(40, pricing)).toBe(201);
    expect(directCostForBrowserTime(41, pricing)).toBe(202);
    expect(directCostForBrowserTime(40_000, pricing)).toBe(1_200);
    expect(creditsForBrowserTime(0, pricing)).toBe(1);
    expect(creditsForBrowserTime(40_000, pricing)).toBe(6);
  });

  it('rejects invalid or out-of-contract metering', () => {
    expect(() => creditsForBrowserTime(-1, pricing)).toThrow('browser milliseconds');
    expect(() => creditsForBrowserTime(40_001, pricing)).toThrow('maximum');
  });
});
