import { isIP } from 'node:net';
import { lookup as dnsLookup } from 'node:dns/promises';
import type { BrowserMeteredProvider, ProviderResult } from '../_registry.js';
import { browserMeteredFail, fail } from '../_registry.js';
import { providerFetch, readResponseBody, type Fetcher } from '../http.js';

type Lookup = (hostname: string) => Promise<Array<{ address: string; family: number }>>;
type BrowserAction = 'screenshot' | 'pdf' | 'markdown';

export interface BrowserInput {
  url: string;
  format?: 'png' | 'jpeg';
  fullPage?: boolean;
  viewportWidth?: number;
  viewportHeight?: number;
}

export type BrowserOutput =
  | { media_type: 'image/png' | 'image/jpeg' | 'application/pdf'; content_base64: string }
  | { markdown: string };

const PRIVATE_REQUEST_PATTERNS = [
  '/^https?:\\/\\/(?:localhost|[^/]*\\.localhost)(?::|\\/|$)/i',
  '/^https?:\\/\\/(?:127\\.|10\\.|0\\.|169\\.254\\.|192\\.168\\.|172\\.(?:1[6-9]|2\\d|3[01])\\.)/i',
  '/^https?:\\/\\/(?:100\\.(?:6[4-9]|[7-9]\\d|1[01]\\d|12[0-7])\\.|198\\.(?:18|19)\\.|192\\.0\\.2\\.|198\\.51\\.100\\.|203\\.0\\.113\\.)/i',
  '/^https?:\\/\\/(?:\\[?::1\\]?|\\[?f[cd][0-9a-f]{2}:|\\[?fe[89ab][0-9a-f]:)/i',
];

function isPublicIp(address: string): boolean {
  if (isIP(address) === 4) {
    const parts = address.split('.').map(Number);
    const [a, b, c] = parts;
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && (b === 168 || (b === 0 && c <= 2))) return false;
    if (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) return false;
    if (a === 203 && b === 0 && c === 113) return false;
    return true;
  }
  if (isIP(address) === 6) {
    const normalized = address.toLowerCase();
    if (normalized === '::' || normalized === '::1') return false;
    if (normalized.startsWith('fc') || normalized.startsWith('fd')) return false;
    if (/^fe[89ab]/.test(normalized) || normalized.startsWith('2001:db8:')) return false;
    if (normalized.startsWith('::ffff:')) return isPublicIp(normalized.slice(7));
    return true;
  }
  return false;
}

export async function validatePublicBrowserUrl(urlValue: string, lookup: Lookup): Promise<ProviderResult<URL>> {
  let url: URL;
  try { url = new URL(urlValue); }
  catch { return fail('bad_input', 'url must be valid HTTP or HTTPS'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    return fail('bad_input', 'url must be public HTTP or HTTPS without credentials');
  }
  const allowedPort = url.protocol === 'http:' ? '80' : '443';
  if (url.port && url.port !== allowedPort) return fail('bad_input', 'url port must be 80 or 443');
  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!hostname.includes('.') && !isIP(hostname)) return fail('bad_input', 'single-label hosts are not allowed');
  if (hostname === 'localhost' || /\.(?:localhost|local|internal|lan|home)$/.test(hostname)) {
    return fail('bad_input', 'private hostnames are not allowed');
  }
  if (isIP(hostname)) {
    if (!isPublicIp(hostname)) return fail('bad_input', 'private or non-routable targets are not allowed');
    return { ok: true, data: url };
  }
  try {
    const addresses = await lookup(hostname);
    if (addresses.length === 0 || addresses.some(({ address }) => !isPublicIp(address))) {
      return fail('bad_input', 'target must resolve only to public addresses');
    }
  } catch {
    return fail('bad_input', 'target hostname could not be resolved');
  }
  return { ok: true, data: url };
}

function browserMs(response: Response, maximum: number): ProviderResult<number> {
  const raw = response.headers.get('x-browser-ms-used');
  if (!raw || !/^\d+$/.test(raw)) return fail('upstream_error', 'Cloudflare returned invalid browser metering');
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) {
    return fail('provider_price_overrun', 'Cloudflare browser metering exceeded the route limit');
  }
  return { ok: true, data: value };
}

function requestBody(action: BrowserAction, input: BrowserInput): Record<string, unknown> {
  const body: Record<string, unknown> = {
    url: input.url,
    gotoOptions: { waitUntil: 'domcontentloaded', timeout: 10_000 },
    actionTimeout: 5_000,
    rejectRequestPattern: PRIVATE_REQUEST_PATTERNS,
  };
  if (action === 'screenshot') {
    body.viewport = { width: input.viewportWidth ?? 1_280, height: input.viewportHeight ?? 720 };
    body.screenshotOptions = { type: input.format ?? 'png', fullPage: input.fullPage ?? false, encoding: 'binary' };
  }
  return body;
}

export function createCloudflareBrowserProvider(
  action: BrowserAction,
  accountId: string,
  apiToken: string,
  maximumBrowserMs: number,
  fetcher: Fetcher = fetch,
  lookup: Lookup = async (hostname) => dnsLookup(hostname, { all: true, verbatim: true }),
): BrowserMeteredProvider<BrowserInput, BrowserOutput> {
  return {
    id: `browser.cloudflare-${action}`,
    storagePolicy: 'metadata-only',
    source: { name: 'Cloudflare Browser Rendering', url: `https://developers.cloudflare.com/browser-run/quick-actions/${action}-endpoint/`, license: 'Commercial API' },
    async execute(input, ctx) {
      if (!accountId || !apiToken) return browserMeteredFail('provider_unavailable', 'browser provider is not configured');
      const validated = await validatePublicBrowserUrl(input.url, lookup);
      if (!validated.ok) return { ok: false, error: validated.error };
      const endpoint = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/browser-rendering/${action}?cacheTTL=0`;
      const fetched = await providerFetch(fetcher, endpoint, {
        method: 'POST', signal: AbortSignal.timeout(20_000),
        headers: { authorization: `Bearer ${apiToken}`, 'content-type': 'application/json', 'user-agent': ctx.userAgent },
        body: JSON.stringify(requestBody(action, { ...input, url: validated.data.toString() })),
      }, 'Cloudflare');
      if (!fetched.ok) return { ok: false, error: fetched.error };
      const response = fetched.data;
      if (!response.ok) {
        return browserMeteredFail(response.status === 429 ? 'rate_limited' : 'upstream_error', `Cloudflare returned HTTP ${response.status}`);
      }
      const metering = browserMs(response, maximumBrowserMs);
      if (!metering.ok) return { ok: false, error: metering.error };

      if (action === 'markdown') {
        const body = await readResponseBody(response, 524_288, 'Cloudflare Markdown exceeded 512 KiB');
        if (!body.ok) return browserMeteredFail(body.error.code, body.error.message);
        const text = body.data.toString('utf8');
        let decoded: unknown;
        try { decoded = JSON.parse(text); }
        catch { return browserMeteredFail('upstream_error', 'Cloudflare returned invalid Markdown JSON'); }
        const envelope = decoded && typeof decoded === 'object' ? decoded as Record<string, unknown> : undefined;
        const result = envelope?.result;
        if (envelope?.success !== true || typeof result !== 'string') return browserMeteredFail('upstream_error', 'Cloudflare returned invalid Markdown content');
        return { ok: true, data: { markdown: result }, metering: { browserMs: metering.data } };
      }

      const body = await readResponseBody(response, 1_048_576, 'Cloudflare binary output exceeded 1 MiB');
      if (!body.ok) return browserMeteredFail(body.error.code, body.error.message);
      const bytes = body.data;
      const mediaType = action === 'pdf'
        ? 'application/pdf'
        : input.format === 'jpeg' ? 'image/jpeg' : 'image/png';
      const responseMediaType = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
      const validSignature = action === 'pdf'
        ? bytes.subarray(0, 5).toString('ascii') === '%PDF-'
        : input.format === 'jpeg'
          ? bytes[0] === 0xff && bytes[1] === 0xd8
          : bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
      if (responseMediaType !== mediaType || !validSignature) {
        return browserMeteredFail('upstream_error', 'Cloudflare returned invalid binary content');
      }
      return {
        ok: true,
        data: { media_type: mediaType, content_base64: bytes.toString('base64') },
        metering: { browserMs: metering.data },
      };
    },
  };
}
