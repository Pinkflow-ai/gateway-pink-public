import { describe, it, expect } from 'vitest';
import { vi } from 'vitest';
import { createNoaaProvider, noaaProvider } from '../../src/providers/weather/noaa.js';

const ctx = { requestId: 't', timeoutMs: 8000, userAgent: 'gateway-pink-test' };

// NOAA's api.weather.gov is free but rate-limited (~60 req/min) and US-only.
// Live calls are opt-in via RUN_LIVE=1 so CI never depends on the upstream.
const live = process.env.RUN_LIVE === '1' ? it : it.skip;

describe('noaa weather', () => {
  it('rejects out-of-range coordinates', async () => {
    const r = await noaaProvider.execute({ lat: 999, lon: 0 }, ctx);
    expect(r.ok).toBe(false);
  });

  it('normalizes timeouts and caches a successful forecast', async () => {
    const timeout = createNoaaProvider(vi.fn(async () => {
      throw new DOMException('timed out', 'TimeoutError');
    }));
    expect(await timeout.execute({ lat: 40.71, lon: -74.01 }, ctx))
      .toMatchObject({ ok: false, error: { code: 'upstream_timeout' } });

    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ properties: {
        forecast: 'https://api.weather.gov/gridpoints/OKX/1,1/forecast', cwa: 'OKX',
      } })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ properties: { periods: [{
        temperature: 68, windSpeed: '10 mph', shortForecast: 'Clear',
      }] } })));
    const provider = createNoaaProvider(fetcher);
    await provider.execute({ lat: 40.71, lon: -74.01 }, ctx);
    const second = await provider.execute({ lat: 40.71, lon: -74.01 }, ctx);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(second).toMatchObject({ ok: true, data: { temp: 20, ttl: 300 } });
  });

  live('returns a forecast for a US point', async () => {
    // NYC area — covered by NWS.
    const r = await noaaProvider.execute({ lat: 40.71, lon: -74.01 }, ctx);
    if (r.ok) {
      expect(r.data.conditions).toBeTruthy();
      expect(r.data.unit).toBe('C');
    }
  });
});
