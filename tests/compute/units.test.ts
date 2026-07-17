import { describe, expect, it } from 'vitest';
import { unitsProvider } from '../../src/providers/compute/units.js';

const ctx = { requestId: 't', timeoutMs: 1000, userAgent: 'test' };

describe('unit conversion', () => {
  it('converts length units', async () => {
    const result = await unitsProvider.execute({ value: 1, from: 'km', to: 'm' }, ctx);
    expect(result).toEqual({
      ok: true,
      data: { value: 1, from: 'km', to: 'm', result: 1000, dimension: 'length' },
    });
  });

  it('converts affine temperature units', async () => {
    const result = await unitsProvider.execute({ value: 0, from: 'c', to: 'f' }, ctx);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.data.result).toBeCloseTo(32, 10);
  });

  it('rejects conversions across dimensions', async () => {
    const result = await unitsProvider.execute({ value: 1, from: 'kg', to: 'm' }, ctx);
    expect(result).toEqual({
      ok: false,
      error: { code: 'bad_input', message: 'cannot convert mass to length' },
    });
  });
});
