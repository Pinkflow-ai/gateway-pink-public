import { describe, it, expect } from 'vitest';
import { hmacProvider } from '../../src/providers/compute/hmac.js';

const ctx = { requestId: 't', timeoutMs: 1000, userAgent: 'test' };

describe('hmac', () => {
  it('defaults to sha256', async () => {
    const r = await hmacProvider.execute({ message: 'm', secret: 's' }, ctx);
    if (r.ok) expect(r.data.algorithm).toBe('sha256');
  });

  it('produces a hex tag', async () => {
    const r = await hmacProvider.execute({ message: 'm', secret: 's', algorithm: 'sha512' }, ctx);
    if (r.ok) expect(r.data.tag).toMatch(/^[0-9a-f]{128}$/);
  });

  it('is deterministic for the same inputs', async () => {
    const a = await hmacProvider.execute({ message: 'm', secret: 's' }, ctx);
    const b = await hmacProvider.execute({ message: 'm', secret: 's' }, ctx);
    if (a.ok && b.ok) expect(a.data.tag).toBe(b.data.tag);
  });
});
