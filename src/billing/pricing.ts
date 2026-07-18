export interface RuntimeFlatPricing {
  kind: 'flat';
  credits: number;
}

export interface PricingManifest {
  version: 1;
  creditUsdMicros: 1_000;
  routes: Record<string, { kind: 'free'; credits: 0 } | RuntimeFlatPricing | RuntimeMeteredPricing | RuntimeBrowserTimePricing>;
}

export interface RuntimeMeteredPricing {
  kind: 'metered';
  unit: 'provider-cost';
  provider: 'openrouter';
  model: string;
  promptUsdMicrosPerMillionTokens: number;
  completionUsdMicrosPerMillionTokens: number;
  maxInputCharacters: number;
  maxOutputTokens: number;
  minimumCredits: number;
  reserveCredits: number;
  targetMarginBps: number;
  providerFeeBps: number;
}

export interface RuntimeBrowserTimePricing {
  kind: 'metered';
  unit: 'browser-time';
  provider: 'cloudflare-browser-rendering';
  browserUsdMicrosPerHour: 90_000;
  baseCostMicros: 200;
  maximumBrowserMs: number;
  minimumCredits: 1;
  reserveCredits: number;
  targetMarginBps: 8_000;
}

function ceilDiv(numerator: number, denominator: number): number {
  return Math.floor((numerator + denominator - 1) / denominator);
}

/** Mirror of the shared manifest's integer settlement formula: $0.001/credit. */
export function creditsForProviderCost(
  providerCostMicros: number,
  pricing: RuntimeMeteredPricing,
): number {
  if (!Number.isSafeInteger(providerCostMicros) || providerCostMicros < 0) {
    throw new RangeError('provider cost must be a non-negative integer');
  }
  const withFee = ceilDiv(providerCostMicros * (10_000 + pricing.providerFeeBps), 10_000);
  const credits = ceilDiv(withFee * 10_000, (10_000 - pricing.targetMarginBps) * 1_000);
  return Math.max(pricing.minimumCredits, credits);
}

export function directCostForBrowserTime(
  browserMs: number,
  pricing: RuntimeBrowserTimePricing,
): number {
  if (!Number.isSafeInteger(browserMs) || browserMs < 0) {
    throw new RangeError('browser milliseconds must be a non-negative integer');
  }
  if (browserMs > pricing.maximumBrowserMs) {
    throw new RangeError(`browser milliseconds exceed maximum ${pricing.maximumBrowserMs}`);
  }
  return ceilDiv(browserMs, 40) + pricing.baseCostMicros;
}

export function creditsForBrowserTime(
  browserMs: number,
  pricing: RuntimeBrowserTimePricing,
): number {
  const directCostMicros = directCostForBrowserTime(browserMs, pricing);
  const credits = ceilDiv(
    directCostMicros * 10_000,
    (10_000 - pricing.targetMarginBps) * 1_000,
  );
  return Math.max(pricing.minimumCredits, credits);
}

/**
 * UTF-8 bytes are an intentionally conservative token ceiling. It can
 * over-reserve, but settlement refunds the difference and never exceeds the
 * caller's declared max_credits.
 */
export function estimateMeteredCredits(
  text: string,
  pricing: RuntimeMeteredPricing,
  maxOutputTokens = pricing.maxOutputTokens,
): number {
  if (!Number.isSafeInteger(maxOutputTokens) || maxOutputTokens <= 0 || maxOutputTokens > pricing.maxOutputTokens) {
    throw new RangeError(`max output tokens must be from 1 to ${pricing.maxOutputTokens}`);
  }
  const inputTokenCeiling = Buffer.byteLength(text, 'utf8') + 256;
  const inputMicros = ceilDiv(
    inputTokenCeiling * pricing.promptUsdMicrosPerMillionTokens,
    1_000_000,
  );
  const outputMicros = ceilDiv(
    maxOutputTokens * pricing.completionUsdMicrosPerMillionTokens,
    1_000_000,
  );
  return creditsForProviderCost(inputMicros + outputMicros, pricing);
}

export function providerCostForTokens(
  inputTokens: number,
  outputTokens: number,
  pricing: RuntimeMeteredPricing,
): number {
  return ceilDiv(inputTokens * pricing.promptUsdMicrosPerMillionTokens, 1_000_000)
    + ceilDiv(outputTokens * pricing.completionUsdMicrosPerMillionTokens, 1_000_000);
}
