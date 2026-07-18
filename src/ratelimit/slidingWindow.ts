import { createHash } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../config.js';
import { makeError } from '../lib/errors.js';
import type { WindowLimiter, WindowResult } from './types.js';

export class SlidingWindowLimiter implements WindowLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly windowMs = 60_000,
    private readonly maximumKeys = 10_000,
  ) {}

  check(key: string, limit: number, now = Date.now()): WindowResult {
    let recent = (this.hits.get(key) ?? []).filter((timestamp) => now - timestamp < this.windowMs);
    if (recent.length >= limit) {
      const retryAfterSeconds = Math.max(1, Math.ceil((recent[0] + this.windowMs - now) / 1_000));
      this.hits.delete(key);
      this.hits.set(key, recent);
      return { allowed: false, remaining: 0, retryAfterSeconds };
    }
    recent.push(now);
    this.hits.delete(key);
    this.hits.set(key, recent);
    while (this.hits.size > this.maximumKeys) {
      const oldest = this.hits.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      this.hits.delete(oldest);
    }
    return { allowed: true, remaining: limit - recent.length, retryAfterSeconds: 0 };
  }

  get keyCount(): number { return this.hits.size; }
}

function routeLimit(route: string): number {
  if (route.startsWith('POST /v1/browser/') || route === 'POST /v1/ai/summarize') return 10;
  if (route === 'POST /v1/compute/qr'
    || route === 'POST /v1/compute/json-schema'
    || route === 'POST /v1/compute/csv'
    || route === 'POST /v1/security/password-exposure') return 30;
  return 60;
}

function keyFingerprint(req: FastifyRequest): string {
  if (req.gatewayPrincipal) return req.gatewayPrincipal.apiKeyId;
  const authorization = req.headers.authorization;
  if (authorization?.startsWith('Bearer ')) {
    return createHash('sha256').update(authorization.slice(7)).digest('hex');
  }
  return `ip:${req.ip || 'unknown'}`;
}

function reject(reply: FastifyReply, req: FastifyRequest, retryAfterSeconds: number): void {
  reply.header('Retry-After', String(retryAfterSeconds)).code(429)
    .send(makeError('rate_limited', 'too many requests, slow down', req.id));
}

export interface RateLimitOptions {
  network?: WindowLimiter;
  routes?: WindowLimiter;
}

async function checked(
  limiter: WindowLimiter,
  key: string,
  limit: number,
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<WindowResult | null> {
  try {
    return await limiter.check(key, limit, Date.now(), req.id);
  } catch {
    await reply.code(503).send(makeError(
      'rate_limit_unavailable', 'rate limiting is unavailable', req.id,
    ));
    return null;
  }
}

export async function rateLimit(app: FastifyInstance, options: RateLimitOptions = {}): Promise<void> {
  const network = options.network ?? new SlidingWindowLimiter();
  const routes = options.routes ?? new SlidingWindowLimiter();

  app.addHook('onRequest', async (req, reply) => {
    if ((req.routeOptions?.config as { publicRoute?: boolean } | undefined)?.publicRoute) return;
    const result = await checked(network, `network:${req.ip || 'unknown'}`, config.rateLimitPerMinute, req, reply);
    if (!result) return;
    if (!result.allowed) reject(reply, req, result.retryAfterSeconds);
  });

  app.addHook('preHandler', async (req, reply) => {
    if ((req.routeOptions?.config as { publicRoute?: boolean } | undefined)?.publicRoute) return;
    const route = `${req.method} ${req.routeOptions.url}`;
    const limit = routeLimit(route);
    const result = await checked(routes, `${route}:${keyFingerprint(req)}`, limit, req, reply);
    if (!result) return;
    reply.header('X-RateLimit-Limit', String(limit));
    reply.header('X-RateLimit-Remaining', String(result.remaining));
    if (!result.allowed) reject(reply, req, result.retryAfterSeconds);
  });
}
