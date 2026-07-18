import { ok, fail, type Provider, type ProviderResult } from '../_registry.js';
import { providerFetch, type Fetcher } from '../http.js';
import { TtlCache } from '../../lib/ttlCache.js';

interface WeatherInput { lat: number; lon: number }
interface WeatherOutput {
  temp: number; unit: 'C' | 'F'; windKph: number; conditions: string;
  office: string; fetchedAt: string; ttl: number;
}

const BASE = 'https://api.weather.gov';

async function getJson(
  fetcher: Fetcher,
  url: string,
  userAgent: string,
  timeoutMs: number,
): Promise<ProviderResult<unknown>> {
  const fetched = await providerFetch(fetcher, url, {
    headers: { 'User-Agent': userAgent, Accept: 'application/geo+json' },
    signal: AbortSignal.timeout(timeoutMs),
  }, 'NOAA');
  if (!fetched.ok) return fetched;
  if (!fetched.data.ok) return fail('upstream_error', `NOAA returned HTTP ${fetched.data.status}`);
  try { return ok(await fetched.data.json()); }
  catch { return fail('upstream_error', 'NOAA returned invalid JSON'); }
}

function pick(obj: unknown, path: string[]): unknown {
  let current: unknown = obj;
  for (const key of path) {
    if (!current || typeof current !== 'object' || !(key in current)) return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

export function createNoaaProvider(
  fetcher: Fetcher = fetch,
  cache = new TtlCache<WeatherOutput>(1_000),
): Provider<WeatherInput, WeatherOutput> {
  return {
    id: 'weather.us',
    storagePolicy: 'cached-ttl',
    source: { name: 'NOAA / NWS', url: 'https://www.weather.gov/', license: 'Public domain (US government work)', notes: 'US locations only.' },
    async execute({ lat, lon }, ctx) {
      if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return fail('bad_input', 'lat/lon out of range');
      const key = `${lat.toFixed(4)},${lon.toFixed(4)}`;
      const cached = cache.get(key);
      if (cached) return ok(cached);
      const points = await getJson(fetcher, `${BASE}/points/${key}`, ctx.userAgent, ctx.timeoutMs);
      if (!points.ok) return points;
      const forecastUrl = pick(points.data, ['properties', 'forecast']);
      if (typeof forecastUrl !== 'string' || !forecastUrl.startsWith('https://api.weather.gov/')) {
        return fail('upstream_error', 'no forecast grid for this location (US coverage only)');
      }
      const forecast = await getJson(fetcher, forecastUrl, ctx.userAgent, ctx.timeoutMs);
      if (!forecast.ok) return forecast;
      const periods = pick(forecast.data, ['properties', 'periods']);
      const first = Array.isArray(periods) ? periods[0] as Record<string, unknown> | undefined : undefined;
      if (!first) return fail('upstream_error', 'no forecast periods returned');
      const tempF = Number(pick(first, ['temperature']) ?? Number.NaN);
      const windMph = Number(String(pick(first, ['windSpeed']) ?? '').split(' ')[0]);
      const data: WeatherOutput = {
        temp: Number.isFinite(tempF) ? Math.round(((tempF - 32) * 5) / 9 * 10) / 10 : 0,
        unit: 'C',
        windKph: Number.isFinite(windMph) ? Math.round(windMph * 1.609) : 0,
        conditions: String(pick(first, ['shortForecast']) ?? 'unknown'),
        office: String(pick(points.data, ['properties', 'cwa']) ?? 'unknown'),
        fetchedAt: new Date().toISOString(),
        ttl: 300,
      };
      cache.set(key, data, 300_000);
      return ok(data);
    },
  };
}

export const noaaProvider = createNoaaProvider();
