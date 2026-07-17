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
