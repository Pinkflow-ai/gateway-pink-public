import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { MemoryUsageMeter } from '../../src/billing/memory.js';
import type { RuntimeMeteredPricing } from '../../src/billing/pricing.js';
import type { BrowserMeteredProvider, MeteredProvider, Provider } from '../../src/providers/_registry.js';
import { paidRoutes, type PaidRouteDependencies } from '../../src/routes/paid/index.js';

const emailPrice = { kind: 'flat' as const, credits: 17 };
const phonePrice = { kind: 'flat' as const, credits: 40 };
const screenshotPrice = { kind: 'flat' as const, credits: 45 };
const metered: RuntimeMeteredPricing = {
  kind: 'metered', unit: 'provider-cost', provider: 'openrouter',
  model: 'google/gemini-2.5-flash-lite', promptUsdMicrosPerMillionTokens: 100_000,
  completionUsdMicrosPerMillionTokens: 400_000, maxInputCharacters: 50_000,
  maxOutputTokens: 1_024, minimumCredits: 1, reserveCredits: 100,
  targetMarginBps: 8_000, providerFeeBps: 550,
};
const browserPrice = {
  kind: 'metered' as const, unit: 'browser-time' as const,
  provider: 'cloudflare-browser-rendering' as const,
  browserUsdMicrosPerHour: 90_000 as const, baseCostMicros: 200 as const,
  maximumBrowserMs: 40_000, minimumCredits: 1 as const,
  reserveCredits: 6, targetMarginBps: 8_000 as const,
};
const markdownPrice = { ...browserPrice, maximumBrowserMs: 16_000, reserveCredits: 3 };
const source = { name: 'test', url: 'https://example.test', license: 'test' };
const paidHeaders = (key: string) => ({ 'idempotency-key': key });
const identity = { orgId: 'org-dev', apiKeyId: 'key-dev' };

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

function browserProvider(browserMs = 840): BrowserMeteredProvider<unknown, { content_base64: string }> {
  return {
    id: 'test-browser', source, storagePolicy: 'metadata-only',
    execute: vi.fn(async () => ({
      ok: true as const, data: { content_base64: 'cG5n' }, metering: { browserMs },
    })),
  };
}

async function appFor(meter: MemoryUsageMeter, overrides: Partial<PaidRouteDependencies> = {}) {
  const app = Fastify();
  const deps: PaidRouteDependencies = {
    meter,
    identityForRequest: () => identity,
    prices: { email: emailPrice, phone: phonePrice, screenshot: screenshotPrice, summarize: metered,
      browserScreenshot: browserPrice, browserPdf: browserPrice, browserMarkdown: markdownPrice },
    emailProvider: provider({ ok: true, data: { valid: true } }),
    phoneProvider: provider({ ok: true, data: { valid: true } }),
    screenshotProvider: provider({ ok: true, data: { url: 'https://example.test/s.png' } }),
    summarizeProvider: meteredProvider(),
    browserScreenshotProvider: browserProvider(),
    browserPdfProvider: browserProvider(),
    browserMarkdownProvider: browserProvider(),
    ...overrides,
  };
  await app.register(paidRoutes, deps);
  return app;
}

describe('paid routes', () => {
  it('does not call an upstream when credits are insufficient', async () => {
    const emailProvider = provider({ ok: true, data: { valid: true } });
    const app = await appFor(new MemoryUsageMeter(5), { emailProvider });
    const response = await app.inject({ method: 'POST', url: '/v1/email/validate', headers: paidHeaders('insufficient'), payload: { email: 'person@example.com' } });
    expect(response.statusCode).toBe(402);
    expect(response.json().error.code).toBe('insufficient_credits');
    expect(emailProvider.execute).not.toHaveBeenCalled();
  });

  it.each([
    ['org_billing_disabled', 403],
    ['billing_debt', 402],
  ] as const)('fails before the provider when org billing returns %s', async (reason, status) => {
    const emailProvider = provider({ ok: true, data: { valid: true } });
    const meter = new MemoryUsageMeter(100);
    vi.spyOn(meter, 'reserve').mockResolvedValue({ ok: false, reason, availableCredits: 100 } as never);
    const app = await appFor(meter, { emailProvider });
    const response = await app.inject({
      method: 'POST', url: '/v1/email/validate', headers: paidHeaders(`org-${reason}`),
      payload: { email: 'person@example.com' },
    });
    expect(response.statusCode).toBe(status);
    expect(response.json().error.code).toBe(reason);
    expect(emailProvider.execute).not.toHaveBeenCalled();
  });

  it('releases the reservation and charges zero on provider failure', async () => {
    const emailProvider = provider({ ok: false, error: { code: 'upstream_error', message: 'provider down' } });
    const meter = new MemoryUsageMeter(20);
    const app = await appFor(meter, { emailProvider });
    const failed = await app.inject({ method: 'POST', url: '/v1/email/validate', headers: paidHeaders('provider-failure'), payload: { email: 'person@example.com' } });
    expect(failed.statusCode).toBe(502);
    expect(failed.headers['x-credits-charged']).toBe('0');

    const reservation = await meter.reserve(identity, 'later', 'POST /v1/email/validate', 20, 'later');
    expect(reservation).toMatchObject({ ok: true, availableCredits: 0 });
  });

  it('settles a flat route and reports charge and remaining balance', async () => {
    const app = await appFor(new MemoryUsageMeter(20));
    const response = await app.inject({ method: 'POST', url: '/v1/email/validate', headers: paidHeaders('flat-success'), payload: { email: 'person@example.com' } });
    expect(response.statusCode).toBe(200);
    expect(response.headers['x-credits-charged']).toBe('17');
    expect(response.headers['x-credits-remaining']).toBe('3');
  });

  it('rejects an AI request whose declared budget cannot cover preflight', async () => {
    const summarizeProvider = meteredProvider();
    const app = await appFor(new MemoryUsageMeter(100), { summarizeProvider });
    const response = await app.inject({ method: 'POST', url: '/v1/ai/summarize', headers: paidHeaders('budget-low'), payload: {
      text: 'x'.repeat(50_000), max_credits: 1,
    } });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('budget_too_low');
    expect(summarizeProvider.execute).not.toHaveBeenCalled();
  });

  it('settles AI from provider-reported cost and exposes token counts', async () => {
    const app = await appFor(new MemoryUsageMeter(100));
    const response = await app.inject({ method: 'POST', url: '/v1/ai/summarize', headers: paidHeaders('ai-success'), payload: {
      text: 'A long document.', max_credits: 10,
    } });
    expect(response.statusCode).toBe(200);
    expect(response.headers['x-credits-charged']).toBe('6');
    expect(response.json().usage).toEqual({ input_tokens: 100, output_tokens: 20, credits_charged: 6 });
  });

  it('settles browser calls from reported browser milliseconds', async () => {
    const app = await appFor(new MemoryUsageMeter(10));
    const response = await app.inject({
      method: 'POST', url: '/v1/browser/screenshot', headers: paidHeaders('browser-success'),
      payload: { url: 'https://example.com' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['x-credits-charged']).toBe('2');
    expect(response.json().usage).toEqual({ browser_ms: 840, credits_charged: 2 });
  });

  it('charges zero and disables a browser route after an over-limit provider report', async () => {
    const browserScreenshotProvider: BrowserMeteredProvider<unknown, unknown> = {
      id: 'test-browser', source, storagePolicy: 'metadata-only',
      execute: vi.fn(async () => ({
        ok: false as const,
        error: { code: 'provider_price_overrun' as const, message: 'metering exceeded route maximum' },
      })),
    };
    const app = await appFor(new MemoryUsageMeter(20), { browserScreenshotProvider });
    const first = await app.inject({ method: 'POST', url: '/v1/browser/screenshot',
      headers: paidHeaders('browser-overrun'), payload: { url: 'https://example.com' } });
    expect(first.statusCode).toBe(502);
    expect(first.headers['x-credits-charged']).toBe('0');

    const second = await app.inject({ method: 'POST', url: '/v1/browser/screenshot',
      headers: paidHeaders('browser-after-overrun'), payload: { url: 'https://example.com' } });
    expect(second.statusCode).toBe(503);
    expect(second.json().error.code).toBe('route_disabled');
    expect(browserScreenshotProvider.execute).toHaveBeenCalledTimes(1);
  });

  it('requires a valid idempotency key before reserving or calling a paid provider', async () => {
    const emailProvider = provider({ ok: true, data: { valid: true } });
    const app = await appFor(new MemoryUsageMeter(20), { emailProvider });
    const missing = await app.inject({ method: 'POST', url: '/v1/email/validate', payload: { email: 'person@example.com' } });
    expect(missing.statusCode).toBe(400);
    expect(missing.json().error.code).toBe('idempotency_key_required');
    expect(emailProvider.execute).not.toHaveBeenCalled();
  });

  it('never calls or charges twice when an idempotency key is reused', async () => {
    const emailProvider = provider({ ok: true, data: { valid: true } });
    const app = await appFor(new MemoryUsageMeter(40), { emailProvider });
    const request = { method: 'POST' as const, url: '/v1/email/validate', headers: paidHeaders('same-call'), payload: { email: 'person@example.com' } };
    expect((await app.inject(request)).statusCode).toBe(200);
    const replay = await app.inject(request);
    expect(replay.statusCode).toBe(409);
    expect(replay.json().error.code).toBe('request_already_settled');
    expect(emailProvider.execute).toHaveBeenCalledTimes(1);
  });

  it('keeps the reservation pending when settlement remains ambiguous', async () => {
    const emailProvider = provider({ ok: true, data: { valid: true } });
    const meter = new MemoryUsageMeter(40);
    const release = vi.spyOn(meter, 'release');
    vi.spyOn(meter, 'settle').mockRejectedValue(new Error('settlement response lost'));
    const app = await appFor(meter, { emailProvider });
    const request = { method: 'POST' as const, url: '/v1/email/validate', headers: paidHeaders('ambiguous'), payload: { email: 'person@example.com' } };

    const first = await app.inject(request);
    expect(first.statusCode).toBe(503);
    expect(first.json().error.code).toBe('billing_unknown');
    expect(release).not.toHaveBeenCalled();

    const replay = await app.inject(request);
    expect(replay.statusCode).toBe(503);
    expect(replay.json().error.code).toBe('billing_unknown');
    expect(emailProvider.execute).toHaveBeenCalledTimes(1);
  });
});
