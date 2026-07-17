import { describe, it, expect } from 'vitest';
import { hashProvider } from '../../src/providers/compute/hash.js';

const ctx = { requestId: 't', timeoutMs: 1000, userAgent: 'test' };

describe('hash', () => {
  it('sha256 of a known string', async () => {
    const r = await hashProvider.execute({ input: 'hello world', algorithm: 'sha256' }, ctx);
    if (r.ok) {
      expect(r.data.algorithm).toBe('sha256');
      expect(r.data.digest).toBe('b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9');
    }
  });

  it('md5 differs from sha256', async () => {
    const r = await hashProvider.execute({ input: 'hello world', algorithm: 'md5' }, ctx);
    if (r.ok) expect(r.data.digest).not.toHaveLength(64);
  });

  it('refuses an unknown algorithm', async () => {
    const r = await hashProvider.execute({ input: 'x', algorithm: 'rot13' as never }, ctx);
    expect(r.ok).toBe(false);
  });
});
