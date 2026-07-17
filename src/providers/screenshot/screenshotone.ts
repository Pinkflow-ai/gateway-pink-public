import { fail, ok, type Provider } from '../_registry.js';
import { providerFetch, providerJson, type Fetcher } from '../http.js';

interface ScreenshotInput {
  url: string;
  format: 'png' | 'jpeg' | 'webp';
  fullPage: boolean;
  viewportWidth: number;
  viewportHeight: number;
}
interface ScreenshotOutput { url: string; temporary: true; maximumTtlHours: 4 }
interface ScreenshotOneResponse { screenshot_url?: string }

export function createScreenshotProvider(accessKey: string, fetcher: Fetcher = fetch): Provider<ScreenshotInput, ScreenshotOutput> {
  return {
    id: 'screenshot.screenshotone',
    storagePolicy: 'metadata-only',
    source: { name: 'ScreenshotOne', url: 'https://screenshotone.com/docs/getting-started/', license: 'Commercial API' },
    async execute(input, ctx) {
      if (!accessKey) return fail('provider_unavailable', 'screenshot provider is not configured');
      const response = await providerFetch(fetcher, 'https://api.screenshotone.com/take', {
        method: 'POST',
        signal: AbortSignal.timeout(ctx.timeoutMs),
        headers: { 'content-type': 'application/json', 'x-access-key': accessKey, 'user-agent': ctx.userAgent },
        body: JSON.stringify({
          url: input.url,
          format: input.format,
          full_page: input.fullPage,
          viewport_width: input.viewportWidth,
          viewport_height: input.viewportHeight,
          response_type: 'json',
        }),
      }, 'ScreenshotOne');
      if (!response.ok) return response;
      const raw = await providerJson<ScreenshotOneResponse>(response.data, 'ScreenshotOne');
      if (!raw.ok) return raw;
      if (!raw.data.screenshot_url) return fail('upstream_error', 'ScreenshotOne returned no screenshot URL');
      return ok({ url: raw.data.screenshot_url, temporary: true, maximumTtlHours: 4 });
    },
  };
}
