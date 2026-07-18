import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export function paddlePayloadHash(rawBody: Buffer): string {
  return createHash('sha256').update(rawBody).digest('hex');
}

export function verifyPaddleSignature(
  rawBody: Buffer,
  header: string | undefined,
  secret: string,
  nowMs = Date.now(),
  toleranceSeconds = 5,
): boolean {
  if (!header || !secret) return false;
  const fields = header.split(';').map((part) => part.split('=', 2) as [string, string]);
  const timestampValue = fields.find(([name]) => name === 'ts')?.[1];
  const signatures = fields.filter(([name]) => name === 'h1').map(([, value]) => value);
  if (!timestampValue || !/^\d+$/.test(timestampValue) || signatures.length === 0) return false;
  const timestamp = Number(timestampValue);
  if (!Number.isSafeInteger(timestamp)) return false;
  if (Math.abs(Math.floor(nowMs / 1_000) - timestamp) > toleranceSeconds) return false;

  const expected = createHmac('sha256', secret)
    .update(`${timestampValue}:`)
    .update(rawBody)
    .digest();
  return signatures.some((candidate) => {
    if (!/^[a-fA-F0-9]{64}$/.test(candidate)) return false;
    const supplied = Buffer.from(candidate, 'hex');
    return supplied.length === expected.length && timingSafeEqual(supplied, expected);
  });
}
