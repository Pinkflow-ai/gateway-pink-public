import { describe, expect, it, vi } from 'vitest';
import { REDIS_SLIDING_WINDOW_SCRIPT, RedisSlidingWindowLimiter } from '../../src/ratelimit/redis.js';

describe('Redis sliding-window limiter', () => {
  it('executes one atomic script with a namespaced key and unique request member', async () => {
    const evalScript = vi.fn(async () => [1, 8, 0]);
    const limiter = new RedisSlidingWindowLimiter({ eval: evalScript }, 60_000, 'gateway:limits');

    await expect(limiter.check('POST /v1/ai/summarize:key-1', 10, 1_000, 'request-1'))
      .resolves.toEqual({ allowed: true, remaining: 8, retryAfterSeconds: 0 });
    expect(evalScript).toHaveBeenCalledWith(REDIS_SLIDING_WINDOW_SCRIPT, {
      keys: ['gateway:limits:POST /v1/ai/summarize:key-1'],
      arguments: ['1000', '60000', '10', 'request-1'],
    });
  });

  it('rounds the returned retry delay upward to seconds', async () => {
    const limiter = new RedisSlidingWindowLimiter({ eval: vi.fn(async () => [0, 0, 30_001]) });
    await expect(limiter.check('key', 10, 1_000, 'request-2')).resolves.toEqual({
      allowed: false, remaining: 0, retryAfterSeconds: 31,
    });
  });

  it('rejects malformed Redis results instead of failing open', async () => {
    for (const result of [null, [], [1], ['yes', 1, 0], [2, 1, 0]]) {
      const limiter = new RedisSlidingWindowLimiter({ eval: vi.fn(async () => result) });
      await expect(limiter.check('key', 10, 1_000, 'request-3'))
        .rejects.toThrow('invalid redis rate-limit result');
    }
  });

  it('uses a script that removes expired hits before counting and expires the key', () => {
    expect(REDIS_SLIDING_WINDOW_SCRIPT).toContain("ZREMRANGEBYSCORE");
    expect(REDIS_SLIDING_WINDOW_SCRIPT).toContain("ZCARD");
    expect(REDIS_SLIDING_WINDOW_SCRIPT).toContain("ZADD");
    expect(REDIS_SLIDING_WINDOW_SCRIPT).toContain("PEXPIRE");
  });
});
