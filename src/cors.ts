import cors from '@fastify/cors';
import type { FastifyInstance } from 'fastify';

const EXPOSED_HEADERS = [
  'X-Credits-Charged',
  'X-Credits-Remaining',
  'X-Gateway-No-Store',
  'X-Gateway-Price-Overrun',
  'X-Gateway-Storage-Policy',
  'X-Request-Id',
  'X-RateLimit-Limit',
  'X-RateLimit-Remaining',
  'Retry-After',
];

/** Restrictive browser access for the public docs/try-it console. */
export async function registerCors(app: FastifyInstance, allowedOrigins: readonly string[]): Promise<void> {
  const origins = new Set(allowedOrigins);
  await app.register(cors, {
    origin(origin, callback) {
      callback(null, !origin || origins.has(origin));
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['authorization', 'content-type', 'idempotency-key'],
    exposedHeaders: EXPOSED_HEADERS,
    maxAge: 86_400,
    strictPreflight: true,
  });
}
