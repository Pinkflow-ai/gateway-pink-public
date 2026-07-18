import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { paddlePayloadHash, verifyPaddleSignature } from '../../src/billing/paddle/signature.js';

const secret = 'notification-secret';
const raw = Buffer.from('{"event_id":"evt_123","data":{"name":"Miro"}}', 'utf8');
const timestamp = 1_721_299_200;

function h1(body = raw): string {
  return createHmac('sha256', secret).update(`${timestamp}:`).update(body).digest('hex');
}

describe('Paddle webhook signature verification', () => {
  it('verifies the exact raw request bytes within the tolerance', () => {
    expect(verifyPaddleSignature(raw, `ts=${timestamp};h1=${h1()}`, secret, timestamp * 1_000, 5)).toBe(true);
    expect(verifyPaddleSignature(
      Buffer.from('{"event_id":"evt_123", "data":{"name":"Miro"}}'),
      `ts=${timestamp};h1=${h1()}`,
      secret,
      timestamp * 1_000,
      5,
    )).toBe(false);
  });

  it('accepts any valid h1 when Paddle rotates signing keys', () => {
    expect(verifyPaddleSignature(
      raw,
      `ts=${timestamp};h1=${'0'.repeat(64)};h1=${h1()}`,
      secret,
      timestamp * 1_000,
      5,
    )).toBe(true);
  });

  it.each([
    [undefined, timestamp * 1_000],
    ['ts=not-a-number;h1=abcd', timestamp * 1_000],
    [`ts=${timestamp};h1=not-hex`, timestamp * 1_000],
    [`ts=${timestamp};h1=${h1()}`, (timestamp + 6) * 1_000],
    [`ts=${timestamp};h1=${h1()}`, (timestamp - 6) * 1_000],
  ])('rejects malformed, missing, or stale signatures', (header, nowMs) => {
    expect(verifyPaddleSignature(raw, header, secret, nowMs, 5)).toBe(false);
  });

  it('hashes the exact payload for idempotency mismatch detection', () => {
    expect(paddlePayloadHash(raw)).toMatch(/^[a-f0-9]{64}$/);
    expect(paddlePayloadHash(raw)).not.toBe(paddlePayloadHash(Buffer.concat([raw, Buffer.from('\n')])));
  });
});
