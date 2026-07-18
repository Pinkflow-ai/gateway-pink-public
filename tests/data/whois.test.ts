import { describe, it, expect, vi } from 'vitest';
import { createRdapProvider, rdapProvider } from '../../src/providers/whois/rdap.js';

const ctx = { requestId: 't', timeoutMs: 8000, userAgent: 'gateway-pink-test' };

// RDAP is free and a public standard, but availability varies by TLD and the
// bootstrap adds latency. Live calls are opt-in via RUN_LIVE=1.
const live = process.env.RUN_LIVE === '1' ? it : it.skip;

describe('rdap whois', () => {
  it('rejects a domain without a dot', async () => {
    const r = await rdapProvider.execute({ domain: 'localhost' }, ctx);
    expect(r.ok).toBe(false);
  });

  it('rejects malformed and path-like domains before the upstream call', async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 404 }));
    const provider = createRdapProvider(fetcher);
    for (const domain of [
      '.example.com', 'example..com', '-bad.com', 'bad-.com',
      'exa_mple.com', 'example.com/path', 'example.com?next=other',
    ]) {
      expect((await provider.execute({ domain }, ctx)).ok).toBe(false);
    }
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('normalizes an upstream timeout', async () => {
    const provider = createRdapProvider(vi.fn(async () => {
      throw new DOMException('timed out', 'TimeoutError');
    }));
    expect(await provider.execute({ domain: 'example.com' }, ctx)).toEqual({
      ok: false, error: { code: 'upstream_timeout', message: 'RDAP timed out' },
    });
  });

  live('marks a well-known domain as registered', async () => {
    const r = await rdapProvider.execute({ domain: 'google.com' }, ctx);
    if (r.ok) expect(r.data.status).toBe('registered');
  });
});
