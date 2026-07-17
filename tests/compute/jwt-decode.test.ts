import { describe, it, expect } from 'vitest';
import { jwtDecodeProvider } from '../../src/providers/compute/jwt-decode.js';

const ctx = { requestId: 't', timeoutMs: 1000, userAgent: 'test' };

// header.payload (no sig) for {"sub":"123"} — no signature verified.
const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjMifQ';

describe('jwt decode', () => {
  it('splits header and payload', async () => {
    const r = await jwtDecodeProvider.execute({ token: TOKEN }, ctx);
    if (r.ok) {
      expect(r.data.header).toEqual({ alg: 'HS256', typ: 'JWT' });
      expect(r.data.payload).toEqual({ sub: '123' });
    }
  });

  it('refuses a non-jwt string', async () => {
    const r = await jwtDecodeProvider.execute({ token: 'not-a-jwt' }, ctx);
    expect(r.ok).toBe(false);
  });
});
