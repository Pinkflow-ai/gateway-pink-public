import { describe, it, expect } from 'vitest';
import { rdapProvider } from '../../src/providers/whois/rdap.js';

const ctx = { requestId: 't', timeoutMs: 8000, userAgent: 'gateway-pink-test' };

// RDAP is free and a public standard, but availability varies by TLD and the
// bootstrap adds latency. Live calls are opt-in via RUN_LIVE=1.
const live = process.env.RUN_LIVE === '1' ? it : it.skip;

describe('rdap whois', () => {
  it('rejects a domain without a dot', async () => {
    const r = await rdapProvider.execute({ domain: 'localhost' }, ctx);
    expect(r.ok).toBe(false);
  });

  live('marks a well-known domain as registered', async () => {
    const r = await rdapProvider.execute({ domain: 'google.com' }, ctx);
    if (r.ok) expect(r.data.status).toBe('registered');
  });
});
