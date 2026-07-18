import { describe, expect, it, vi } from 'vitest';
import { createCloudflareBrowserProvider, validatePublicBrowserUrl } from '../../src/providers/browser/cloudflare.js';

const ctx = { requestId: 'test', timeoutMs: 1_000, userAgent: 'gateway-test' };
const publicLookup = vi.fn(async () => [{ address: '93.184.216.34', family: 4 }]);

describe('Cloudflare browser provider', () => {
  it('rejects credentials, private IPs, internal DNS, and custom ports', async () => {
    for (const url of [
      'http://127.0.0.1/', 'http://10.0.0.1/', 'http://localhost/',
      'https://user:secret@example.com/', 'https://example.com:8443/',
    ]) expect((await validatePublicBrowserUrl(url, publicLookup)).ok).toBe(false);
    expect((await validatePublicBrowserUrl('https://rebind.example/', vi.fn(async () => [{ address: '192.168.1.2', family: 4 }]))).ok).toBe(false);
  });

  it('uses fixed timers, no cache, private-request blocks, and exact metering', async () => {
    const fetcher = vi.fn(async () => new Response(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), {
      status: 200,
      headers: { 'x-browser-ms-used': '840', 'content-type': 'image/png' },
    }));
    const provider = createCloudflareBrowserProvider('screenshot', 'account', 'token', 40_000, fetcher, publicLookup);
    const result = await provider.execute({
      url: 'https://example.com', format: 'png', fullPage: true,
      viewportWidth: 1_280, viewportHeight: 720,
    }, ctx);
    expect(result).toMatchObject({ ok: true, metering: { browserMs: 840 } });
    expect(String(fetcher.mock.calls[0][0])).toContain('/browser-rendering/screenshot?cacheTTL=0');
    const body = JSON.parse(String(fetcher.mock.calls[0][1]?.body));
    expect(body).toMatchObject({
      url: 'https://example.com/', actionTimeout: 5_000,
      gotoOptions: { waitUntil: 'domcontentloaded', timeout: 10_000 },
      screenshotOptions: { type: 'png', fullPage: true, encoding: 'binary' },
    });
    expect(body.rejectRequestPattern.join(' ')).toContain('127');
    expect(body).not.toHaveProperty('html');
    expect(body).not.toHaveProperty('cookies');
  });

  it('fails closed on missing, malformed, or over-limit browser metering', async () => {
    for (const header of [null, '1.2', '-1', '40001']) {
      const headers = header === null ? {} : { 'x-browser-ms-used': header };
      const provider = createCloudflareBrowserProvider('pdf', 'account', 'token', 40_000,
        vi.fn(async () => new Response(Buffer.from('pdf'), { status: 200, headers })), publicLookup);
      const result = await provider.execute({ url: 'https://example.com' }, ctx);
      expect(result).toMatchObject({ ok: false, error: {
        code: header === '40001' ? 'provider_price_overrun' : 'upstream_error',
      } });
    }
  });

  it('parses the Markdown envelope and enforces its byte cap', async () => {
    const provider = createCloudflareBrowserProvider('markdown', 'account', 'token', 16_000,
      vi.fn(async () => new Response(JSON.stringify({ success: true, result: '# Hello' }), {
        status: 200, headers: { 'x-browser-ms-used': '100' },
      })), publicLookup);
    expect(await provider.execute({ url: 'https://example.com' }, ctx)).toEqual({
      ok: true, data: { markdown: '# Hello' }, metering: { browserMs: 100 },
    });
  });

  it('rejects a 200 response whose binary type or signature is not the requested format', async () => {
    const provider = createCloudflareBrowserProvider('pdf', 'account', 'token', 40_000,
      vi.fn(async () => new Response('<html>error</html>', {
        status: 200, headers: { 'x-browser-ms-used': '100', 'content-type': 'text/html' },
      })), publicLookup);
    expect(await provider.execute({ url: 'https://example.com' }, ctx)).toMatchObject({
      ok: false, error: { code: 'upstream_error', message: 'Cloudflare returned invalid binary content' },
    });
  });

  it('cancels an oversized streamed response before buffering the full body', async () => {
    let pulls = 0;
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        controller.enqueue(new Uint8Array(600_000));
        if (pulls === 3) controller.close();
      },
      cancel() { cancelled = true; },
    }, { highWaterMark: 0 });
    const provider = createCloudflareBrowserProvider('pdf', 'account', 'token', 40_000,
      vi.fn(async () => new Response(stream, {
        status: 200,
        headers: { 'x-browser-ms-used': '100', 'content-type': 'application/pdf' },
      })), publicLookup);

    expect(await provider.execute({ url: 'https://example.com' }, ctx)).toMatchObject({
      ok: false,
      error: { code: 'upstream_error', message: 'Cloudflare binary output exceeded 1 MiB' },
    });
    expect(cancelled).toBe(true);
    expect(pulls).toBe(2);
  });
});
