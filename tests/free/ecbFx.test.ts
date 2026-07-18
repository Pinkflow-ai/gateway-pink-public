import { describe, expect, it, vi } from 'vitest';
import { createEcbFxProvider } from '../../src/providers/currency/ecb.js';

const csv = `KEY,FREQ,CURRENCY,CURRENCY_DENOM,EXR_TYPE,EXR_SUFFIX,TIME_PERIOD,OBS_VALUE
EXR.D.ARS.EUR.SP00.A,D,ARS,EUR,SP00,A,2020-10-30,91.5953
EXR.D.GBP.EUR.SP00.A,D,GBP,EUR,SP00,A,2026-07-17,0.8
EXR.D.USD.EUR.SP00.A,D,USD,EUR,SP00,A,2026-07-17,1.1
`;

const context = { requestId: 'fx-1', timeoutMs: 1_000, userAgent: 'Gateway.test' };

describe('ECB daily FX provider', () => {
  it('cross-converts through EUR and preserves the official source date', async () => {
    const fetcher = vi.fn(async () => new Response(csv, { status: 200 }));
    const provider = createEcbFxProvider(fetcher, undefined, () => Date.parse('2026-07-18T12:00:00Z'));
    const result = await provider.execute({ amount: 110, from: 'USD', to: 'GBP' }, context);
    expect(result).toEqual({
      ok: true,
      data: {
        amount: 110,
        from: 'USD',
        to: 'GBP',
        result: 80,
        rate: 0.7272727273,
        sourceDate: '2026-07-17',
        ttl: 21_600,
      },
    });
  });

  it('caches the shared daily snapshot and excludes stale discontinued currencies', async () => {
    const fetcher = vi.fn(async () => new Response(csv, { status: 200 }));
    const provider = createEcbFxProvider(fetcher, undefined, () => Date.parse('2026-07-18T12:00:00Z'));
    await provider.execute({ amount: 1, from: 'EUR', to: 'USD' }, context);
    await provider.execute({ amount: 1, from: 'GBP', to: 'EUR' }, context);
    const unsupported = await provider.execute({ amount: 1, from: 'ARS', to: 'EUR' }, context);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(unsupported).toMatchObject({ ok: false, error: { code: 'bad_input' } });
  });

  it('fails closed when the newest source observation is stale', async () => {
    const provider = createEcbFxProvider(
      vi.fn(async () => new Response(csv, { status: 200 })),
      undefined,
      () => Date.parse('2026-07-30T12:00:00Z'),
    );
    await expect(provider.execute({ amount: 1, from: 'EUR', to: 'USD' }, context))
      .resolves.toMatchObject({ ok: false, error: { code: 'upstream_error' } });
  });

  (process.env.RUN_LIVE === '1' ? it : it.skip)('reads the current official ECB dataset', async () => {
    const provider = createEcbFxProvider();
    const result = await provider.execute({ amount: 1, from: 'EUR', to: 'USD' }, {
      ...context,
      timeoutMs: 15_000,
    });
    expect(result).toMatchObject({
      ok: true,
      data: { amount: 1, from: 'EUR', to: 'USD', ttl: 21_600 },
    });
    if (result.ok) {
      expect(result.data.rate).toBeGreaterThan(0);
      expect(result.data.sourceDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});
