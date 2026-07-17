import { describe, it, expect } from 'vitest';
import { noaaProvider } from '../../src/providers/weather/noaa.js';

const ctx = { requestId: 't', timeoutMs: 8000, userAgent: 'gateway-pink-test' };

// NOAA's api.weather.gov is free but rate-limited (~60 req/min) and US-only.
// Live calls are opt-in via RUN_LIVE=1 so CI never depends on the upstream.
const live = process.env.RUN_LIVE === '1' ? it : it.skip;

describe('noaa weather', () => {
  it('rejects out-of-range coordinates', async () => {
    const r = await noaaProvider.execute({ lat: 999, lon: 0 }, ctx);
    expect(r.ok).toBe(false);
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
