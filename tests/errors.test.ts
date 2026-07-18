import { describe, expect, it } from 'vitest';
import { ERROR_STATUS, toUnexpectedError } from '../src/lib/errors.js';

describe('error envelopes', () => {
  it('never exposes raw internal exception details to clients', () => {
    expect(toUnexpectedError(new Error('postgres://secret@internal-host'), 'request-1')).toEqual({
      error: {
        code: 'internal_error',
        message: 'unexpected internal failure',
        request_id: 'request-1',
      },
    });
  });

  it('maps every provider error code explicitly', () => {
    expect(ERROR_STATUS).toMatchObject({
      bad_input: 400,
      provider_unavailable: 503,
      upstream_error: 502,
      upstream_timeout: 504,
      provider_price_overrun: 502,
      rate_limited: 429,
    });
  });
});
