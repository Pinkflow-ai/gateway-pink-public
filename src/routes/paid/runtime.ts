import type { FastifyRequest } from 'fastify';
import { MemoryUsageMeter } from '../../billing/memory.js';
import { browserTimePrice, flatPrice, loadPricingManifest, meteredPrice } from '../../billing/manifest.js';
import { UnavailableUsageMeter } from '../../billing/unavailable.js';
import { config } from '../../config.js';
import { createSummarizeProvider } from '../../providers/ai/openrouter.js';
import { createEmailValidationProvider } from '../../providers/email/abstract.js';
import { createPhoneLookupProvider } from '../../providers/phone/twilio.js';
import { createScreenshotProvider } from '../../providers/screenshot/screenshotone.js';
import type { PaidRouteDependencies } from './index.js';
import { createCloudflareBrowserProvider } from '../../providers/browser/cloudflare.js';
import type { BillingIdentity, UsageMeter } from '../../billing/types.js';

export interface PaidRuntimeOptions {
  meter?: UsageMeter;
  identityForRequest?: (request: FastifyRequest) => BillingIdentity;
}

export function createPaidRouteDependencies(options: PaidRuntimeOptions = {}): PaidRouteDependencies {
  const manifest = loadPricingManifest(config.pricingManifestPath);
  const summarizePricing = meteredPrice(manifest, 'POST /v1/ai/summarize');
  const meter = options.meter ?? (config.billingMode === 'memory'
    ? new MemoryUsageMeter(config.devCreditBalance)
    : new UnavailableUsageMeter());
  return {
    meter,
    // The public runtime only has dev bearer auth. Production replaces this
    // resolver and meter with the private key-store + Postgres RPC adapter.
    identityForRequest: options.identityForRequest ?? ((request: FastifyRequest) => request.gatewayPrincipal
      ?? { orgId: 'org-dev', apiKeyId: 'dev-open' }),
    prices: {
      email: flatPrice(manifest, 'POST /v1/email/validate'),
      phone: flatPrice(manifest, 'GET /v1/phone/lookup'),
      screenshot: flatPrice(manifest, 'POST /v1/screenshot'),
      summarize: summarizePricing,
      browserScreenshot: browserTimePrice(manifest, 'POST /v1/browser/screenshot'),
      browserPdf: browserTimePrice(manifest, 'POST /v1/browser/pdf'),
      browserMarkdown: browserTimePrice(manifest, 'POST /v1/browser/markdown'),
    },
    emailProvider: createEmailValidationProvider(config.abstractEmailApiKey),
    phoneProvider: createPhoneLookupProvider(config.twilioAccountSid, config.twilioAuthToken),
    screenshotProvider: createScreenshotProvider(config.screenshotOneAccessKey),
    summarizeProvider: createSummarizeProvider(
      config.openRouterApiKey,
      summarizePricing.model,
      summarizePricing,
    ),
    browserScreenshotProvider: createCloudflareBrowserProvider(
      'screenshot', config.cloudflareAccountId, config.cloudflareApiToken,
      browserTimePrice(manifest, 'POST /v1/browser/screenshot').maximumBrowserMs,
    ),
    browserPdfProvider: createCloudflareBrowserProvider(
      'pdf', config.cloudflareAccountId, config.cloudflareApiToken,
      browserTimePrice(manifest, 'POST /v1/browser/pdf').maximumBrowserMs,
    ),
    browserMarkdownProvider: createCloudflareBrowserProvider(
      'markdown', config.cloudflareAccountId, config.cloudflareApiToken,
      browserTimePrice(manifest, 'POST /v1/browser/markdown').maximumBrowserMs,
    ),
  };
}
