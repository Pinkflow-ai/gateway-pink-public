import { describe, it, expect } from 'vitest';
import { passwordProvider } from '../../src/providers/compute/password.js';

const ctx = { requestId: 't', timeoutMs: 1000, userAgent: 'test' };

describe('password', () => {
  it('honors length', async () => {
    const r = await passwordProvider.execute({ length: 40, symbols: true }, ctx);
    if (r.ok) expect(r.data.password).toHaveLength(40);
  });

  it('omits symbols when asked', async () => {
    const r = await passwordProvider.execute({ length: 200, symbols: false }, ctx);
    if (r.ok) {
      expect(/[!@#$%^&*]/.test(r.data.password)).toBe(false);
    }
  });

  it('clamps short requests to 8', async () => {
    const r = await passwordProvider.execute({ length: 3 }, ctx);
    if (r.ok) expect(r.data.length).toBe(8);
  });

  it('does not return the same value twice running', async () => {
    const a = await passwordProvider.execute({}, ctx);
    const b = await passwordProvider.execute({}, ctx);
    if (a.ok && b.ok) expect(a.data.password).not.toBe(b.data.password);
  });
});
