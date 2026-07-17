import type { FastifyRequest } from 'fastify';
import { MemoryUsageMeter } from '../../billing/memory.js';
import { flatPrice, loadPricingManifest, meteredPrice } from '../../billing/manifest.js';
import { UnavailableUsageMeter } from '../../billing/unavailable.js';
import { config } from '../../config.js';
import { createSummarizeProvider } from '../../providers/ai/openrouter.js';
import { createEmailValidationProvider } from '../../providers/email/abstract.js';
import { createPhoneLookupProvider } from '../../providers/phone/twilio.js';
import { createScreenshotProvider } from '../../providers/screenshot/screenshotone.js';
import type { PaidRouteDependencies } from './index.js';

export function createPaidRouteDependencies(): PaidRouteDependencies {
  const manifest = loadPricingManifest(config.pricingManifestPath);
  const summarizePricing = meteredPrice(manifest, 'POST /v1/ai/summarize');
  const meter = config.billingMode === 'memory'
    ? new MemoryUsageMeter(config.devCreditBalance)
    : new UnavailableUsageMeter();
  return {
    meter,
    // The public runtime only has dev bearer auth. Production replaces this
    // resolver and meter with the private key-store + Postgres RPC adapter.
    orgIdForRequest: (_request: FastifyRequest) => 'org-dev',
    prices: {
      email: flatPrice(manifest, 'POST /v1/email/validate'),
      phone: flatPrice(manifest, 'GET /v1/phone/lookup'),
      screenshot: flatPrice(manifest, 'POST /v1/screenshot'),
      summarize: summarizePricing,
    },
    emailProvider: createEmailValidationProvider(config.abstractEmailApiKey),
    phoneProvider: createPhoneLookupProvider(config.twilioAccountSid, config.twilioAuthToken),
    screenshotProvider: createScreenshotProvider(config.screenshotOneAccessKey),
    summarizeProvider: createSummarizeProvider(
      config.openRouterApiKey,
      summarizePricing.model,
      summarizePricing,
    ),
  };
}
