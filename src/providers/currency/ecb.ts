import { parse } from 'csv-parse/sync';
import { TtlCache } from '../../lib/ttlCache.js';
import { fail, ok, type Provider, type ProviderResult } from '../_registry.js';
import { providerFetch, readResponseBody, type Fetcher } from '../http.js';

export interface EcbFxInput {
  amount: number;
  from: string;
  to: string;
}

export interface EcbFxOutput extends EcbFxInput {
  result: number;
  rate: number;
  sourceDate: string;
  ttl: 21_600;
}

interface EcbRow {
  FREQ?: string;
  CURRENCY?: string;
  CURRENCY_DENOM?: string;
  EXR_TYPE?: string;
  EXR_SUFFIX?: string;
  TIME_PERIOD?: string;
  OBS_VALUE?: string;
}

interface EcbSnapshot {
  sourceDate: string;
  rates: Record<string, number>;
}

const ECB_URL = 'https://data-api.ecb.europa.eu/service/data/EXR/D..EUR.SP00.A?lastNObservations=1&format=csvdata';
const CACHE_TTL_MS = 6 * 60 * 60 * 1_000;
const MAX_STALENESS_MS = 7 * 24 * 60 * 60 * 1_000;

function rounded(value: number): number {
  return Number(value.toFixed(10));
}

function snapshotFromCsv(body: string, now: number): ProviderResult<EcbSnapshot> {
  let rows: EcbRow[];
  try {
    rows = parse(body, { columns: true, skip_empty_lines: true, bom: true }) as EcbRow[];
  } catch {
    return fail('upstream_error', 'ECB returned invalid CSV');
  }
  const eligible = rows.filter((row) => row.FREQ === 'D'
    && row.CURRENCY_DENOM === 'EUR'
    && row.EXR_TYPE === 'SP00'
    && row.EXR_SUFFIX === 'A'
    && /^\d{4}-\d{2}-\d{2}$/.test(row.TIME_PERIOD ?? '')
    && /^[A-Z]{3}$/.test(row.CURRENCY ?? '')
    && Number.isFinite(Number(row.OBS_VALUE))
    && Number(row.OBS_VALUE) > 0);
  const sourceDate = eligible.map((row) => row.TIME_PERIOD!).sort().at(-1);
  if (!sourceDate) return fail('upstream_error', 'ECB returned no daily reference rates');
  const sourceTime = Date.parse(`${sourceDate}T00:00:00Z`);
  if (!Number.isFinite(sourceTime) || now - sourceTime > MAX_STALENESS_MS) {
    return fail('upstream_error', 'ECB reference rates are stale');
  }
  const rates: Record<string, number> = { EUR: 1 };
  for (const row of eligible) {
    if (row.TIME_PERIOD === sourceDate) rates[row.CURRENCY!] = Number(row.OBS_VALUE);
  }
  return ok({ sourceDate, rates });
}

export function createEcbFxProvider(
  fetcher: Fetcher = fetch,
  cache = new TtlCache<EcbSnapshot>(1),
  now: () => number = Date.now,
): Provider<EcbFxInput, EcbFxOutput> {
  return {
    id: 'currency.ecb-reference',
    storagePolicy: 'cached-ttl',
    source: {
      name: 'European Central Bank euro foreign exchange reference rates',
      url: 'https://data.ecb.europa.eu/data/datasets/EXR',
      license: 'ECB information reuse terms (citation required)',
      notes: 'Reference rates are informational and are not intended for transaction execution.',
    },
    async execute({ amount, from, to }, ctx) {
      if (!Number.isFinite(amount) || amount < 0) return fail('bad_input', 'amount must be a non-negative number');
      let snapshot = cache.get('daily', now());
      if (!snapshot) {
        const fetched = await providerFetch(fetcher, ECB_URL, {
          headers: { Accept: 'text/csv', 'User-Agent': ctx.userAgent },
          signal: AbortSignal.timeout(ctx.timeoutMs),
        }, 'ECB');
        if (!fetched.ok) return fetched;
        if (!fetched.data.ok) return fail('upstream_error', `ECB returned HTTP ${fetched.data.status}`);
        const body = await readResponseBody(fetched.data, 1_000_000, 'ECB response exceeded 1 MB');
        if (!body.ok) return body;
        const parsed = snapshotFromCsv(body.data.toString('utf8'), now());
        if (!parsed.ok) return parsed;
        snapshot = parsed.data;
        cache.set('daily', snapshot, CACHE_TTL_MS, now());
      }
      const fromRate = snapshot.rates[from];
      const toRate = snapshot.rates[to];
      if (!fromRate || !toRate) return fail('bad_input', 'currency is not in the current ECB reference set');
      const rate = toRate / fromRate;
      return ok({
        amount,
        from,
        to,
        result: rounded(amount * rate),
        rate: rounded(rate),
        sourceDate: snapshot.sourceDate,
        ttl: 21_600,
      });
    },
  };
}

export const ecbFxProvider = createEcbFxProvider();
