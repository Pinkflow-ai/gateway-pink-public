import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { MemoryUsageMeter } from '../../src/billing/memory.js';
import type { RuntimeMeteredPricing } from '../../src/billing/pricing.js';
import type { MeteredProvider, Provider } from '../../src/providers/_registry.js';
import { paidRoutes, type PaidRouteDependencies } from '../../src/routes/paid/index.js';

const emailPrice = { kind: 'flat' as const, credits: 17 };
const phonePrice = { kind: 'flat' as const, credits: 40 };
const screenshotPrice = { kind: 'flat' as const, credits: 20 };
const metered: RuntimeMeteredPricing = {
  kind: 'metered', unit: 'provider-cost', provider: 'openrouter',
  model: 'google/gemini-2.5-flash-lite', promptUsdMicrosPerMillionTokens: 100_000,
  completionUsdMicrosPerMillionTokens: 400_000, maxInputCharacters: 50_000,
  maxOutputTokens: 1_024, minimumCredits: 1, reserveCredits: 100,
  targetMarginBps: 8_000, providerFeeBps: 550,
};
const source = { name: 'test', url: 'https://example.test', license: 'test' };

function provider(result: Awaited<ReturnType<Provider<unknown, unknown>['execute']>>): Provider<unknown, unknown> {
  return { id: 'test', source, storagePolicy: 'metadata-only', execute: vi.fn(async () => result) };
}

function meteredProvider(providerCostMicros = 1_000): MeteredProvider<unknown, { summary: string }> {
  return {
    id: 'test-ai', source, storagePolicy: 'metadata-only',
    execute: vi.fn(async () => ({
      ok: true as const,
      data: { summary: 'short' },
      metering: { providerCostMicros, inputTokens: 100, outputTokens: 20 },
    })),
  };
}

async function appFor(meter: MemoryUsageMeter, overrides: Partial<PaidRouteDependencies> = {}) {
  const app = Fastify();
  const deps: PaidRouteDependencies = {
    meter,
    orgIdForRequest: () => 'org-dev',
    prices: { email: emailPrice, phone: phonePrice, screenshot: screenshotPrice, summarize: metered },
    emailProvider: provider({ ok: true, data: { valid: true } }),
    phoneProvider: provider({ ok: true, data: { valid: true } }),
    screenshotProvider: provider({ ok: true, data: { url: 'https://example.test/s.png' } }),
    summarizeProvider: meteredProvider(),
    ...overrides,
  };
  await app.register(paidRoutes, deps);
  return app;
}

describe('paid routes', () => {
  it('does not call an upstream when credits are insufficient', async () => {
    const emailProvider = provider({ ok: true, data: { valid: true } });
    const app = await appFor(new MemoryUsageMeter(5), { emailProvider });
    const response = await app.inject({ method: 'POST', url: '/v1/email/validate', payload: { email: 'person@example.com' } });
    expect(response.statusCode).toBe(402);
    expect(response.json().error.code).toBe('insufficient_credits');
    expect(emailProvider.execute).not.toHaveBeenCalled();
  });

  it('releases the reservation and charges zero on provider failure', async () => {
    const emailProvider = provider({ ok: false, error: { code: 'upstream_error', message: 'provider down' } });
    const meter = new MemoryUsageMeter(20);
    const app = await appFor(meter, { emailProvider });
    const failed = await app.inject({ method: 'POST', url: '/v1/email/validate', payload: { email: 'person@example.com' } });
    expect(failed.statusCode).toBe(502);
    expect(failed.headers['x-credits-charged']).toBe('0');

    const reservation = await meter.reserve('org-dev', 'later', 'POST /v1/email/validate', 20);
    expect(reservation).toMatchObject({ ok: true, availableCredits: 0 });
  });

  it('settles a flat route and reports charge and remaining balance', async () => {
    const app = await appFor(new MemoryUsageMeter(20));
    const response = await app.inject({ method: 'POST', url: '/v1/email/validate', payload: { email: 'person@example.com' } });
    expect(response.statusCode).toBe(200);
    expect(response.headers['x-credits-charged']).toBe('17');
    expect(response.headers['x-credits-remaining']).toBe('3');
  });

  it('rejects an AI request whose declared budget cannot cover preflight', async () => {
    const summarizeProvider = meteredProvider();
    const app = await appFor(new MemoryUsageMeter(100), { summarizeProvider });
    const response = await app.inject({ method: 'POST', url: '/v1/ai/summarize', payload: {
      text: 'x'.repeat(50_000), max_credits: 1,
    } });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('budget_too_low');
    expect(summarizeProvider.execute).not.toHaveBeenCalled();
  });

  it('settles AI from provider-reported cost and exposes token counts', async () => {
    const app = await appFor(new MemoryUsageMeter(100));
    const response = await app.inject({ method: 'POST', url: '/v1/ai/summarize', payload: {
      text: 'A long document.', max_credits: 10,
    } });
    expect(response.statusCode).toBe(200);
    expect(response.headers['x-credits-charged']).toBe('6');
    expect(response.json().usage).toEqual({ input_tokens: 100, output_tokens: 20, credits_charged: 6 });
  });
});
