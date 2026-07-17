import { describe, expect, it } from 'vitest';
import { toUnexpectedError } from '../src/lib/errors.js';

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
});
