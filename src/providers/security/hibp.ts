import { fail, ok, type Provider } from '../_registry.js';
import { providerFetch, readResponseBody, type Fetcher } from '../http.js';

export function createPasswordExposureProvider(fetcher: Fetcher = fetch): Provider<
  { sha1: string },
  { exposed: boolean; count: number }
> {
  return {
    id: 'security.hibp-passwords',
    storagePolicy: 'none',
    source: { name: 'Have I Been Pwned Pwned Passwords', url: 'https://haveibeenpwned.com/API/v3#PwnedPasswords', license: 'HIBP API terms' },
    async execute({ sha1 }, ctx) {
      const prefix = sha1.slice(0, 5);
      const suffix = sha1.slice(5);
      const fetched = await providerFetch(fetcher, `https://api.pwnedpasswords.com/range/${prefix}`, {
        signal: AbortSignal.timeout(ctx.timeoutMs),
        headers: { 'Add-Padding': 'true', 'User-Agent': ctx.userAgent },
      }, 'HIBP');
      if (!fetched.ok) return fetched;
      if (!fetched.data.ok) {
        if (fetched.data.status === 429) return fail('rate_limited', 'HIBP rate limit reached');
        return fail('upstream_error', `HIBP returned HTTP ${fetched.data.status}`);
      }
      const responseBody = await readResponseBody(fetched.data, 2_097_152, 'HIBP response exceeded 2 MiB');
      if (!responseBody.ok) return responseBody;
      const body = responseBody.data.toString('utf8');
      const match = body.split(/\r?\n/).find((line) => line.slice(0, 35).toUpperCase() === suffix);
      const count = match ? Number.parseInt(match.slice(36), 10) : 0;
      if (!Number.isSafeInteger(count) || count < 0) return fail('upstream_error', 'HIBP returned malformed range data');
      return ok({ exposed: count > 0, count });
    },
  };
}

export const passwordExposureProvider = createPasswordExposureProvider();
