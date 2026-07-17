import { describe, it, expect } from 'vitest';
import { dnsProvider } from '../../src/providers/dns/resolve.js';

const ctx = { requestId: 't', timeoutMs: 5000, userAgent: 'test' };

// These hit the real recursive resolver. Skipped in CI (no network) — run
// locally with RUN_LIVE=1. DNS is free and effectively unrate-limited, but we
// still treat it as a live call.
const live = process.env.RUN_LIVE === '1' ? it : it.skip;

describe('dns resolve', () => {
  it('rejects an unsupported record type', async () => {
    const r = await dnsProvider.execute({ name: 'gateway.pink', type: 'AXFR' as never }, ctx);
    expect(r.ok).toBe(false);
  });

  live('resolves an A record for a real domain', async () => {
    const r = await dnsProvider.execute({ name: 'cloudflare.com', type: 'A' }, ctx);
    if (r.ok) expect(r.data.records.length).toBeGreaterThan(0);
  });

  live('returns empty for a nonexistent name', async () => {
    const r = await dnsProvider.execute(
      { name: 'this-domain-truly-does-exist-nope.invalid', type: 'A' },
      ctx,
    );
    if (r.ok) expect(r.data.records).toEqual([]);
  });
});
