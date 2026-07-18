import { describe, expect, it, vi } from 'vitest';
import { createEmailValidationProvider } from '../../src/providers/email/abstract.js';
import { createPhoneLookupProvider } from '../../src/providers/phone/twilio.js';
import { createScreenshotProvider } from '../../src/providers/screenshot/screenshotone.js';
import { createSummarizeProvider } from '../../src/providers/ai/openrouter.js';

const ctx = { requestId: 'request-1', timeoutMs: 1000, userAgent: 'test' };

describe('paid provider adapters', () => {
  it('distinguishes missing credentials from an upstream outage', async () => {
    const result = await createEmailValidationProvider('').execute({ email: 'person@example.com' }, ctx);
    expect(result).toEqual({
      ok: false,
      error: { code: 'provider_unavailable', message: 'email validation provider is not configured' },
    });
  });

  it('normalizes Abstract email validation without exposing its raw response', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      email: 'person@example.com', deliverability: 'DELIVERABLE', quality_score: '0.97',
      is_valid_format: { value: true }, is_mx_found: { value: true },
      is_smtp_valid: { value: true }, is_disposable_email: { value: false },
      is_role_email: { value: false }, is_catchall_email: { value: false },
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    const result = await createEmailValidationProvider('secret', fetcher).execute({ email: 'person@example.com' }, ctx);
    expect(result).toEqual({ ok: true, data: {
      email: 'person@example.com', deliverability: 'deliverable', qualityScore: 0.97,
      validFormat: true, mxFound: true, smtpValid: true, disposable: false,
      roleAddress: false, catchAll: false,
    } });
    expect(String(fetcher.mock.calls[0][0])).toContain('email=person%40example.com');
  });

  it('normalizes provider timeouts instead of throwing an internal error', async () => {
    const fetcher = vi.fn(async () => {
      throw new DOMException('The operation timed out', 'TimeoutError');
    });
    const result = await createEmailValidationProvider('secret', fetcher).execute({ email: 'person@example.com' }, ctx);
    expect(result).toEqual({
      ok: false,
      error: { code: 'upstream_timeout', message: 'Abstract timed out' },
    });
  });

  it('refuses to bill a malformed Abstract success body', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      email: 'person@example.com', deliverability: 'DELIVERABLE', quality_score: '0.97',
    }), { status: 200 }));
    const result = await createEmailValidationProvider('secret', fetcher).execute({ email: 'person@example.com' }, ctx);
    expect(result).toEqual({
      ok: false,
      error: { code: 'upstream_error', message: 'Abstract returned an invalid response' },
    });
  });

  it('uses Twilio Lookup v2 line type intelligence', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      phone_number: '+14159929960', national_format: '(415) 992-9960',
      country_code: 'US', valid: true,
      line_type_intelligence: { type: 'nonFixedVoip', carrier_name: 'Example Carrier', error_code: null },
    }), { status: 200 }));
    const result = await createPhoneLookupProvider('AC123', 'token', fetcher).execute({ number: '+14159929960' }, ctx);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.data).toMatchObject({ number: '+14159929960', valid: true, lineType: 'nonFixedVoip' });
    expect(fetcher.mock.calls[0][1]?.headers).toMatchObject({ authorization: expect.stringMatching(/^Basic /) });
  });

  it('refuses to bill a malformed Twilio success body', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ valid: 'yes' }), { status: 200 }));
    const result = await createPhoneLookupProvider('AC123', 'token', fetcher).execute({ number: '+14159929960' }, ctx);
    expect(result).toEqual({
      ok: false,
      error: { code: 'upstream_error', message: 'Twilio returned an invalid response' },
    });
  });

  it('returns ScreenshotOne temporary URLs instead of proxying image bytes', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ screenshot_url: 'https://cdn.example/s.png' }), { status: 200 }));
    const result = await createScreenshotProvider('secret', fetcher).execute({
      url: 'https://example.com', format: 'png', fullPage: true,
      viewportWidth: 1280, viewportHeight: 720,
    }, ctx);
    expect(result).toEqual({ ok: true, data: { url: 'https://cdn.example/s.png', temporary: true, maximumTtlHours: 4 } });
    const request = JSON.parse(String(fetcher.mock.calls[0][1]?.body));
    expect(request).toMatchObject({ response_type: 'json', full_page: true, viewport_width: 1280 });
  });

  it('captures OpenRouter token usage and provider cost for settlement', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: 'Short summary.' } }],
      usage: { prompt_tokens: 100, completion_tokens: 20, cost: 0.000018 },
    }), { status: 200 }));
    const provider = createSummarizeProvider('secret', 'google/gemini-2.5-flash-lite', {
      promptUsdMicrosPerMillionTokens: 100_000,
      completionUsdMicrosPerMillionTokens: 400_000,
    }, fetcher);
    const result = await provider.execute({ text: 'Long text', style: 'concise', maxOutputTokens: 256 }, ctx);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.data).toEqual({ summary: 'Short summary.', model: 'google/gemini-2.5-flash-lite' });
    expect(result.metering).toEqual({ providerCostMicros: 18, inputTokens: 100, outputTokens: 20 });
    const request = JSON.parse(String(fetcher.mock.calls[0][1]?.body));
    expect(request.provider).toEqual({
      sort: 'price',
      data_collection: 'deny',
      max_price: { prompt: 0.0000001, completion: 0.0000004 },
    });
  });

  it('rejects a successful OpenRouter response without token usage', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: 'Short summary.' } }],
      usage: { cost: 0.000018 },
    }), { status: 200 }));
    const provider = createSummarizeProvider('secret', 'google/gemini-2.5-flash-lite', {
      promptUsdMicrosPerMillionTokens: 100_000,
      completionUsdMicrosPerMillionTokens: 400_000,
    }, fetcher);
    const result = await provider.execute({ text: 'Long text', style: 'concise', maxOutputTokens: 256 }, ctx);
    expect(result).toEqual({
      ok: false,
      error: { code: 'upstream_error', message: 'OpenRouter returned invalid usage data' },
    });
  });

  it('rejects a successful OpenRouter response without actual provider cost', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: 'Short summary.' } }],
      usage: { prompt_tokens: 100, completion_tokens: 20 },
    }), { status: 200 }));
    const provider = createSummarizeProvider('secret', 'google/gemini-2.5-flash-lite', {
      promptUsdMicrosPerMillionTokens: 100_000,
      completionUsdMicrosPerMillionTokens: 400_000,
    }, fetcher);
    const result = await provider.execute({ text: 'Long text', style: 'concise', maxOutputTokens: 256 }, ctx);
    expect(result).toEqual({
      ok: false,
      error: { code: 'upstream_error', message: 'OpenRouter returned invalid usage data' },
    });
  });
});
