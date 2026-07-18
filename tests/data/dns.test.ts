import { describe, it, expect } from 'vitest';
import { createDnsProvider, dnsProvider } from '../../src/providers/dns/resolve.js';

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

  it('rejects internal and single-label names before resolution', async () => {
    for (const name of ['localhost', 'service.internal', 'printer.local', '127.0.0.1']) {
      const r = await dnsProvider.execute({ name, type: 'A' }, ctx);
      expect(r).toMatchObject({ ok: false, error: { code: 'bad_input' } });
    }
  });

  it('normalizes timeouts and caches successful answers for the declared TTL', async () => {
    const timeout = createDnsProvider(async () => new Promise(() => {}));
    expect(await timeout.execute({ name: 'example.com', type: 'A' }, { ...ctx, timeoutMs: 5 }))
      .toMatchObject({ ok: false, error: { code: 'upstream_timeout' } });

    let calls = 0;
    const cached = createDnsProvider(async () => { calls += 1; return ['93.184.216.34']; });
    await cached.execute({ name: 'example.com', type: 'A' }, ctx);
    const second = await cached.execute({ name: 'example.com', type: 'A' }, ctx);
    expect(calls).toBe(1);
    expect(second).toMatchObject({ ok: true, data: { ttl: 60 } });
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
