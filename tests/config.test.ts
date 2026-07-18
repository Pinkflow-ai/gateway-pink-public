import { describe, expect, it } from 'vitest';
import { parseConfig } from '../src/config.js';

describe('configuration safety', () => {
  it('allows anonymous mode only while billing is off', () => {
    expect(parseConfig({ BILLING_MODE: 'off', GATEWAY_DEV_KEYS: '' }).billingMode).toBe('off');
    expect(() => parseConfig({ BILLING_MODE: 'memory', GATEWAY_DEV_KEYS: '' }))
      .toThrow('paid billing requires at least one gateway dev key');
  });

  it('allows memory billing with an authenticated development key', () => {
    expect(parseConfig({ BILLING_MODE: 'memory', GATEWAY_DEV_KEYS: 'gp_test' }).billingMode)
      .toBe('memory');
  });

  it('accepts only the complete durable dependency set in production', () => {
    const config = parseConfig({
      RUNTIME_ENV: 'production',
      AUTH_MODE: 'postgres',
      BILLING_MODE: 'postgres',
      RATE_LIMIT_MODE: 'redis',
      DATABASE_URL: 'postgresql://gateway:test@db.example/gateway',
      REDIS_URL: 'rediss://cache.example:6379',
      GATEWAY_KEY_PEPPER: 'p'.repeat(32),
    });
    expect(config).toMatchObject({
      runtimeEnv: 'production', authMode: 'postgres', billingMode: 'postgres', rateLimitMode: 'redis',
    });
  });

  it.each([
    [{ RUNTIME_ENV: 'production' }, 'production requires AUTH_MODE=postgres'],
    [{ RUNTIME_ENV: 'production', AUTH_MODE: 'postgres' }, 'production requires BILLING_MODE=postgres'],
    [{ RUNTIME_ENV: 'production', AUTH_MODE: 'postgres', BILLING_MODE: 'postgres' }, 'production requires RATE_LIMIT_MODE=redis'],
    [{ RUNTIME_ENV: 'production', AUTH_MODE: 'postgres', BILLING_MODE: 'postgres', RATE_LIMIT_MODE: 'redis' }, 'production requires DATABASE_URL'],
    [{ RUNTIME_ENV: 'production', AUTH_MODE: 'postgres', BILLING_MODE: 'postgres', RATE_LIMIT_MODE: 'redis', DATABASE_URL: 'postgresql://db/gateway' }, 'production requires REDIS_URL'],
    [{ RUNTIME_ENV: 'production', AUTH_MODE: 'postgres', BILLING_MODE: 'postgres', RATE_LIMIT_MODE: 'redis', DATABASE_URL: 'postgresql://db/gateway', REDIS_URL: 'redis://cache' }, 'production requires a key pepper of at least 32 characters'],
  ])('rejects incomplete production configuration', (environment, message) => {
    expect(() => parseConfig(environment)).toThrow(message);
  });

  it('rejects postgres or Redis mode when its dependency URL is missing in development', () => {
    expect(() => parseConfig({ AUTH_MODE: 'postgres' })).toThrow('postgres auth requires DATABASE_URL');
    expect(() => parseConfig({ RATE_LIMIT_MODE: 'redis' })).toThrow('redis rate limiting requires REDIS_URL');
  });
});
