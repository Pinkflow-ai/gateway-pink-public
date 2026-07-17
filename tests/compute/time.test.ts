import { describe, expect, it } from 'vitest';
import { timeProvider } from '../../src/providers/compute/time.js';

const ctx = { requestId: 't', timeoutMs: 1000, userAgent: 'test' };

describe('time', () => {
  it('renders a timestamp in the requested IANA timezone', async () => {
    const result = await timeProvider.execute(
      { at: '2026-01-01T00:00:00.000Z', timezone: 'Asia/Jerusalem' },
      ctx,
    );
    if (!result.ok) throw new Error(result.error.message);
    expect(result.data).toMatchObject({
      timezone: 'Asia/Jerusalem',
      utc: '2026-01-01T00:00:00.000Z',
      unixSeconds: 1767225600,
      local: '2026-01-01T02:00:00+02:00',
    });
  });

  it('rejects unknown timezones', async () => {
    const result = await timeProvider.execute({ timezone: 'Moon/SeaOfTranquility' }, ctx);
    expect(result).toEqual({
      ok: false,
      error: { code: 'bad_input', message: 'unknown IANA timezone' },
    });
  });
});
