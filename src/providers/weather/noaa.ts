import { ok, fail, type Provider } from '../_registry.js';

interface WeatherInput {
  lat: number;
  lon: number;
}
interface WeatherOutput {
  temp: number;
  unit: 'C' | 'F';
  windKph: number;
  conditions: string;
  office: string;
  fetchedAt: string;
}

const BASE = 'https://api.weather.gov';

async function getJson(url: string, userAgent: string, timeoutMs: number): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': userAgent, Accept: 'application/geo+json' }, signal: controller.signal });
    if (!res.ok) {
      return { __status: res.status, __statusText: res.statusText };
    }
    return (await res.json()) as unknown;
  } finally {
    clearTimeout(timer);
  }
}

function pick(obj: unknown, path: string[]): unknown {
  let cur: unknown = obj;
  for (const k of path) {
    if (cur && typeof cur === 'object' && k in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[k];
    } else {
      return undefined;
    }
  }
  return cur;
}

/**
 * US weather via NOAA / NWS (api.weather.gov). Public-domain US-government data.
 *
 * Two-step: points/{lat},{lon} → forecast office grid → forecast. NOAA asks
 * for a identifying User-Agent and limits usage to roughly 60 req/min — our
 * development limiter enforces a source-IP cap, so callers don't get blocked.
 *
 * Payload (lat/lon) is not stored. The forecast response is cached briefly
 * upstream of this provider — see storagePolicy 'cached-ttl'.
 */
export const noaaProvider: Provider<WeatherInput, WeatherOutput> = {
  id: 'weather.us',
  storagePolicy: 'cached-ttl',
  source: {
    name: 'NOAA / NWS',
    url: 'https://www.weather.gov/',
    license: 'Public domain (US government work)',
    notes: 'api.weather.gov, ~60 req/min implicit upstream limit.',
  },
  async execute({ lat, lon }, ctx) {
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      return fail('bad_input', 'lat/lon out of range');
    }
    // NWS only covers US states and territories. Foreign coords 404.
    const pointsUrl = `${BASE}/points/${lat.toFixed(4)},${lon.toFixed(4)}`;
    const points = await getJson(pointsUrl, ctx.userAgent, ctx.timeoutMs);
    const forecastUrl = pick(points, ['properties', 'forecast']) as string | undefined;
    if (!forecastUrl) {
      return fail('upstream_error', 'no forecast grid for this location (US coverage only)');
    }
    const forecast = await getJson(forecastUrl, ctx.userAgent, ctx.timeoutMs);
    const periods = pick(forecast, ['properties', 'periods']) as unknown[];
    const first = periods?.[0] as Record<string, unknown> | undefined;
    if (!first) return fail('upstream_error', 'no forecast periods returned');

    const tempF = Number(pick(first, ['temperature']) ?? NaN);
    const windMph = Number(pick(first, ['windSpeed'])?.toString().split(' ')[0] ?? NaN);
    return ok({
      temp: Number.isFinite(tempF) ? Math.round(((tempF - 32) * 5) / 9 * 10) / 10 : 0,
      unit: 'C',
      windKph: Number.isFinite(windMph) ? Math.round(windMph * 1.609) : 0,
      conditions: String(pick(first, ['shortForecast']) ?? 'unknown'),
      office: String(pick(points, ['properties', 'cwa']) ?? 'unknown'),
      fetchedAt: new Date().toISOString(),
    });
  },
};
