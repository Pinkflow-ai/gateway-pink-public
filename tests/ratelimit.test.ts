import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { SlidingWindowLimiter, rateLimit } from '../src/ratelimit/slidingWindow.js';
import type { WindowLimiter } from '../src/ratelimit/types.js';

describe('sliding-window rate limits', () => {
  it('bounds key storage and calculates exact retry delay', () => {
    const limiter = new SlidingWindowLimiter(60_000, 2);
    expect(limiter.check('a', 1, 1_000).allowed).toBe(true);
    expect(limiter.check('a', 1, 31_001)).toMatchObject({ allowed: false, retryAfterSeconds: 30 });
    limiter.check('b', 1, 31_001);
    limiter.check('c', 1, 31_001);
    expect(limiter.keyCount).toBe(2);
  });

  it('applies the 10 request browser class and an exact Retry-After', async () => {
    const app = Fastify();
    await rateLimit(app);
    app.post('/v1/browser/pdf', async () => ({ ok: true }));
    for (let index = 0; index < 10; index += 1) {
      const response = await app.inject({ method: 'POST', url: '/v1/browser/pdf' });
      expect(response.statusCode).toBe(200);
      expect(response.headers['x-ratelimit-limit']).toBe('10');
    }
    const limited = await app.inject({ method: 'POST', url: '/v1/browser/pdf' });
    expect(limited.statusCode).toBe(429);
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
    expect(Number(limited.headers['retry-after'])).toBeLessThanOrEqual(60);
    await app.close();
  });

  it('keys the route scope by authenticated API-key ID', async () => {
    const checked: string[] = [];
    const routes: WindowLimiter = {
      check: async (key) => {
        checked.push(key);
        return { allowed: true, remaining: 9, retryAfterSeconds: 0 };
      },
    };
    const app = Fastify();
    app.decorateRequest('gatewayPrincipal', null);
    app.addHook('onRequest', async (request) => {
      request.gatewayPrincipal = { orgId: 'org-1', apiKeyId: 'key-1', mcpEnabled: false };
    });
    await rateLimit(app, { network: new SlidingWindowLimiter(), routes });
    app.post('/v1/browser/pdf', async () => ({ ok: true }));

    expect((await app.inject({ method: 'POST', url: '/v1/browser/pdf' })).statusCode).toBe(200);
    expect(checked).toEqual(['POST /v1/browser/pdf:key-1']);
    await app.close();
  });

  it('fails closed with 503 when a distributed limiter is unavailable', async () => {
    const unavailable: WindowLimiter = { check: async () => { throw new Error('redis down'); } };
    const app = Fastify();
    await rateLimit(app, { network: unavailable, routes: unavailable });
    app.get('/private', async () => ({ ok: true }));
    const response = await app.inject('/private');
    expect(response.statusCode).toBe(503);
    expect(response.json().error).toMatchObject({
      code: 'rate_limit_unavailable', message: 'rate limiting is unavailable',
    });
    await app.close();
  });
});
