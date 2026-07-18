import { describe, expect, it } from 'vitest';
import { phoneValidationProvider } from '../../src/providers/phone/validate.js';

const context = { requestId: 'phone-1', timeoutMs: 1_000, userAgent: 'Gateway.test' };

describe('free phone validation provider', () => {
  it('normalizes an international number with offline numbering-plan metadata', async () => {
    const result = await phoneValidationProvider.execute({ number: '+41 44 668 18 00' }, context);
    expect(result).toEqual({
      ok: true,
      data: {
        valid: true,
        possible: true,
        e164: '+41446681800',
        international: '+41 44 668 18 00',
        national: '044 668 18 00',
        country: 'CH',
        numberType: 'fixed-line',
      },
    });
  });

  it('uses an explicit ISO region for a national number', async () => {
    const result = await phoneValidationProvider.execute(
      { number: '044 668 18 00', country: 'ch' },
      context,
    );
    expect(result).toMatchObject({ ok: true, data: { valid: true, e164: '+41446681800', country: 'CH' } });
  });

  it('reports invalid input as a validation result rather than claiming reachability', async () => {
    const result = await phoneValidationProvider.execute({ number: 'not-a-phone' }, context);
    expect(result).toMatchObject({ ok: true, data: { valid: false, possible: false } });
  });
});
