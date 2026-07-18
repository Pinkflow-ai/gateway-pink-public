import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { SlidingWindowLimiter, rateLimit } from '../src/ratelimit/slidingWindow.js';

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
});
