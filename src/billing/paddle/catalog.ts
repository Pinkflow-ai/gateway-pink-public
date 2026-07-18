import type { Config } from '../../config.js';

export const PADDLE_PRICING_VERSION = '2026-07-18-paddle-standard';

export interface PaddleCreditPack {
  packId: 'starter' | 'standard' | 'growth' | 'scale';
  priceId: string;
  credits: number;
  subtotalCents: number;
  currency: 'USD';
  pricingVersion: typeof PADDLE_PRICING_VERSION;
}

export interface PaddleCatalog {
  packs: readonly PaddleCreditPack[];
  byPackId(packId: string): PaddleCreditPack | null;
  byPriceId(priceId: string): PaddleCreditPack | null;
}

export function buildPaddleCatalog(config: Config): PaddleCatalog {
  const packs: readonly PaddleCreditPack[] = [
    { packId: 'starter', priceId: config.paddlePriceStarter, credits: 10_000, subtotalCents: 1_106, currency: 'USD', pricingVersion: PADDLE_PRICING_VERSION },
    { packId: 'standard', priceId: config.paddlePriceStandard, credits: 50_000, subtotalCents: 5_316, currency: 'USD', pricingVersion: PADDLE_PRICING_VERSION },
    { packId: 'growth', priceId: config.paddlePriceGrowth, credits: 100_000, subtotalCents: 10_579, currency: 'USD', pricingVersion: PADDLE_PRICING_VERSION },
    { packId: 'scale', priceId: config.paddlePriceScale, credits: 500_000, subtotalCents: 52_685, currency: 'USD', pricingVersion: PADDLE_PRICING_VERSION },
  ];
  return {
    packs,
    byPackId: (packId) => packs.find((pack) => pack.packId === packId) ?? null,
    byPriceId: (priceId) => packs.find((pack) => pack.priceId === priceId) ?? null,
  };
}

export function creditsForAdjustment(pack: PaddleCreditPack, subtotalCents: number): number {
  if (!Number.isSafeInteger(subtotalCents) || subtotalCents <= 0) return 0;
  return Math.min(pack.credits, Math.ceil((pack.credits * subtotalCents) / pack.subtotalCents));
}
