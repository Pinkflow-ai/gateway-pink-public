import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../config.js';
import { makeError } from '../lib/errors.js';

/**
 * In-memory sliding-window limiter (architecture.md §7 stands in for Redis).
 *
 * The limit is per source IP. Even free APIs are rate-limited — this is the
 * documented default of RATE_LIMIT_PER_MINUTE (60/min). State is lost on
 * restart, which is fine for the dev gateway. The Redis-backed version lives
 * in the private repo for production.
 */
export async function rateLimit(app: FastifyInstance): Promise<void> {
  const windowMs = 60_000;
  const limit = config.rateLimitPerMinute;
  const hits = new Map<string, number[]>(); // ip → timestamps

  const prune = (now: number, ip: string): number[] => {
    const recent = (hits.get(ip) ?? []).filter((t) => now - t < windowMs);
    hits.set(ip, recent);
    return recent;
  };

  app.addHook('onRequest', async (req: FastifyRequest, reply: FastifyReply) => {
    if ((req.routeOptions?.config as { publicRoute?: boolean } | undefined)?.publicRoute) {
      return;
    }
    const ip = (req.ip ?? 'unknown').toString();
    const now = Date.now();
    const recent = prune(now, ip);

    const remaining = limit - recent.length;
    reply.header('X-RateLimit-Limit', String(limit));
    reply.header('X-RateLimit-Remaining', String(Math.max(remaining - 1, 0)));

    if (remaining <= 0) {
      reply
        .header('Retry-After', String(Math.ceil(windowMs / 1000)))
        .code(429)
        .send(makeError('rate_limited', 'too many requests, slow down', req.id));
    } else {
      recent.push(now);
    }
  });
}
