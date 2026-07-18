import { fail, type ProviderResult, type UpstreamErrorCode } from './_registry.js';

export type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export async function providerFetch(
  fetcher: Fetcher,
  input: string | URL | Request,
  init: RequestInit,
  providerName: string,
): Promise<ProviderResult<Response>> {
  try {
    return { ok: true, data: await fetcher(input, init) };
  } catch (error) {
    const name = error instanceof Error ? error.name : '';
    return name === 'AbortError' || name === 'TimeoutError'
      ? fail('upstream_timeout', `${providerName} timed out`)
      : fail('upstream_error', `${providerName} request failed`);
  }
}

export async function providerJson<T>(
  response: Response,
  providerName: string,
): Promise<ProviderResult<T>> {
  if (!response.ok) {
    const code: UpstreamErrorCode = response.status === 429 ? 'rate_limited' : 'upstream_error';
    return fail(code, `${providerName} returned HTTP ${response.status}`);
  }
  try {
    return { ok: true, data: await response.json() as T };
  } catch {
    return fail('upstream_error', `${providerName} returned invalid JSON`);
  }
}

/**
 * Read an upstream body without ever buffering more than the published cap.
 * This matters for caller-influenced rendering targets where Content-Length
 * can be absent or dishonest.
 */
export async function readResponseBody(
  response: Response,
  maximumBytes: number,
  tooLargeMessage: string,
): Promise<ProviderResult<Buffer>> {
  const contentLength = response.headers.get('content-length');
  if (contentLength && /^\d+$/.test(contentLength) && Number(contentLength) > maximumBytes) {
    try { await response.body?.cancel(); } catch { /* best effort */ }
    return fail('upstream_error', tooLargeMessage);
  }
  if (!response.body) return { ok: true, data: Buffer.alloc(0) };

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maximumBytes) {
        await reader.cancel();
        return fail('upstream_error', tooLargeMessage);
      }
      chunks.push(value);
    }
  } catch {
    try { await reader.cancel(); } catch { /* best effort */ }
    return fail('upstream_error', 'upstream response body could not be read');
  }
  return { ok: true, data: Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), total) };
}
