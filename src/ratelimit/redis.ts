import { randomUUID } from 'node:crypto';
import type { WindowLimiter, WindowResult } from './types.js';

export const REDIS_SLIDING_WINDOW_SCRIPT = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local member = ARGV[4]

redis.call('ZREMRANGEBYSCORE', key, '-inf', now - window)
local count = redis.call('ZCARD', key)
if count >= limit then
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  local retry_ms = 1
  if oldest[2] then
    retry_ms = math.max(1, tonumber(oldest[2]) + window - now)
  end
  redis.call('PEXPIRE', key, window)
  return {0, 0, retry_ms}
end

redis.call('ZADD', key, now, member)
redis.call('PEXPIRE', key, window)
return {1, limit - count - 1, 0}
`;

export interface RedisScriptClient {
  eval(
    script: string,
    options: { keys: string[]; arguments: string[] },
  ): Promise<unknown>;
}

function integer(value: unknown): number | null {
  const number = typeof value === 'number' ? value
    : typeof value === 'string' && /^-?\d+$/.test(value) ? Number(value) : Number.NaN;
  return Number.isSafeInteger(number) ? number : null;
}

function parseResult(result: unknown): WindowResult {
  if (!Array.isArray(result) || result.length !== 3) throw new Error('invalid redis rate-limit result');
  const allowed = integer(result[0]);
  const remaining = integer(result[1]);
  const retryMs = integer(result[2]);
  if ((allowed !== 0 && allowed !== 1) || remaining === null || remaining < 0
    || retryMs === null || retryMs < 0) {
    throw new Error('invalid redis rate-limit result');
  }
  return {
    allowed: allowed === 1,
    remaining,
    retryAfterSeconds: retryMs === 0 ? 0 : Math.max(1, Math.ceil(retryMs / 1_000)),
  };
}

export class RedisSlidingWindowLimiter implements WindowLimiter {
  constructor(
    private readonly client: RedisScriptClient,
    private readonly windowMs = 60_000,
    private readonly prefix = 'gateway:rate-limit',
  ) {
    if (!Number.isSafeInteger(windowMs) || windowMs <= 0) throw new RangeError('window must be positive');
  }

  async check(key: string, limit: number, now = Date.now(), requestId = randomUUID()): Promise<WindowResult> {
    if (!Number.isSafeInteger(limit) || limit <= 0) throw new RangeError('limit must be positive');
    const result = await this.client.eval(REDIS_SLIDING_WINDOW_SCRIPT, {
      keys: [`${this.prefix}:${key}`],
      arguments: [String(now), String(this.windowMs), String(limit), requestId],
    });
    return parseResult(result);
  }
}
