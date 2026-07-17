import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import type { PricingManifest, RuntimeFlatPricing, RuntimeMeteredPricing } from './pricing.js';

const freeSchema = z.object({ kind: z.literal('free'), credits: z.literal(0) }).strict();
const flatSchema = z.object({ kind: z.literal('flat'), credits: z.number().int().positive() }).strict();
const meteredSchema = z.object({
  kind: z.literal('metered'), unit: z.literal('provider-cost'), provider: z.literal('openrouter'),
  model: z.string().min(1), promptUsdMicrosPerMillionTokens: z.number().int().nonnegative(),
  completionUsdMicrosPerMillionTokens: z.number().int().nonnegative(),
  maxInputCharacters: z.number().int().positive(), maxOutputTokens: z.number().int().positive(),
  minimumCredits: z.number().int().positive(), reserveCredits: z.number().int().positive(),
  targetMarginBps: z.number().int().min(0).max(9_999), providerFeeBps: z.number().int().nonnegative(),
}).strict();
const manifestSchema = z.object({
  version: z.literal(1), creditUsdMicros: z.literal(1_000),
  routes: z.record(z.union([freeSchema, flatSchema, meteredSchema])),
}).strict();

export function loadPricingManifest(path: string): PricingManifest {
  const parsed = JSON.parse(readFileSync(resolve(path), 'utf8')) as unknown;
  return manifestSchema.parse(parsed) as PricingManifest;
}

export function flatPrice(manifest: PricingManifest, route: string): RuntimeFlatPricing {
  const price = manifest.routes[route];
  if (price?.kind !== 'flat') throw new Error(`missing flat pricing for ${route}`);
  return price;
}

export function meteredPrice(manifest: PricingManifest, route: string): RuntimeMeteredPricing {
  const price = manifest.routes[route];
  if (price?.kind !== 'metered') throw new Error(`missing metered pricing for ${route}`);
  return price;
}
