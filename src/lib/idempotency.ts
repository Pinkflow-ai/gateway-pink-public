import { createHash } from 'node:crypto';
import type { FastifyRequest } from 'fastify';

const KEY_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`).join(',')}}`;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function idempotencyKeyFor(req: FastifyRequest): string | null {
  const value = req.headers['idempotency-key'];
  return typeof value === 'string' && KEY_PATTERN.test(value) ? value : null;
}

export function billingRequestId(orgId: string, key: string): string {
  return sha256(`${orgId}\0${key}`);
}

export function requestFingerprint(method: string, route: string, input: unknown): string {
  return sha256(`${method.toUpperCase()}\0${route}\0${canonical(input)}`);
}
