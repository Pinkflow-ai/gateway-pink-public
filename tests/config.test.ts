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
      CHECKOUT_MODE: 'paddle',
      DATABASE_URL: 'postgresql://gateway:test@db.example/gateway',
      REDIS_URL: 'rediss://cache.example:6379',
      GATEWAY_KEY_PEPPER: 'p'.repeat(32),
      PADDLE_ENVIRONMENT: 'production',
      PADDLE_API_KEY: 'pdl_live_secret',
      PADDLE_WEBHOOK_SECRET: 'pdl_ntfset_secret',
      PADDLE_CHECKOUT_URL: 'https://gateway.pink/checkout',
      PADDLE_PRICE_STARTER: 'pri_starter',
      PADDLE_PRICE_STANDARD: 'pri_standard',
      PADDLE_PRICE_GROWTH: 'pri_growth',
      PADDLE_PRICE_SCALE: 'pri_scale',
    });
    expect(config).toMatchObject({
      runtimeEnv: 'production', authMode: 'postgres', billingMode: 'postgres',
      rateLimitMode: 'redis', checkoutMode: 'paddle', paddleEnvironment: 'production',
    });
  });

  it.each([
    [{ RUNTIME_ENV: 'production' }, 'production requires AUTH_MODE=postgres'],
    [{ RUNTIME_ENV: 'production', AUTH_MODE: 'postgres' }, 'production requires BILLING_MODE=postgres'],
    [{ RUNTIME_ENV: 'production', AUTH_MODE: 'postgres', BILLING_MODE: 'postgres' }, 'production requires RATE_LIMIT_MODE=redis'],
    [{ RUNTIME_ENV: 'production', AUTH_MODE: 'postgres', BILLING_MODE: 'postgres', RATE_LIMIT_MODE: 'redis' }, 'production requires DATABASE_URL'],
    [{ RUNTIME_ENV: 'production', AUTH_MODE: 'postgres', BILLING_MODE: 'postgres', RATE_LIMIT_MODE: 'redis', DATABASE_URL: 'postgresql://db/gateway' }, 'production requires REDIS_URL'],
    [{ RUNTIME_ENV: 'production', AUTH_MODE: 'postgres', BILLING_MODE: 'postgres', RATE_LIMIT_MODE: 'redis', DATABASE_URL: 'postgresql://db/gateway', REDIS_URL: 'redis://cache' }, 'production requires a key pepper of at least 32 characters'],
    [{ RUNTIME_ENV: 'production', AUTH_MODE: 'postgres', BILLING_MODE: 'postgres', RATE_LIMIT_MODE: 'redis', DATABASE_URL: 'postgresql://db/gateway', REDIS_URL: 'redis://cache', GATEWAY_KEY_PEPPER: 'p'.repeat(32) }, 'production requires CHECKOUT_MODE=paddle'],
  ])('rejects incomplete production configuration', (environment, message) => {
    expect(() => parseConfig(environment)).toThrow(message);
  });

  it('rejects an incomplete Paddle checkout configuration', () => {
    expect(() => parseConfig({ CHECKOUT_MODE: 'paddle' }))
      .toThrow('Paddle checkout requires PADDLE_API_KEY');
    expect(() => parseConfig({
      CHECKOUT_MODE: 'paddle',
      PADDLE_API_KEY: 'pdl_test_secret',
      PADDLE_WEBHOOK_SECRET: 'notification-secret',
      PADDLE_CHECKOUT_URL: 'http://gateway.pink/checkout',
      PADDLE_PRICE_STARTER: 'pri_starter',
      PADDLE_PRICE_STANDARD: 'pri_standard',
      PADDLE_PRICE_GROWTH: 'pri_growth',
      PADDLE_PRICE_SCALE: 'pri_scale',
    })).toThrow('PADDLE_CHECKOUT_URL must be an https URL');
    expect(() => parseConfig({
      CHECKOUT_MODE: 'paddle',
      PADDLE_API_KEY: 'pdl_test_secret',
      PADDLE_WEBHOOK_SECRET: 'notification-secret',
      PADDLE_CHECKOUT_URL: 'https://gateway.pink/checkout',
      PADDLE_PRICE_STARTER: 'pri_starter',
      PADDLE_PRICE_STANDARD: 'pri_standard',
      PADDLE_PRICE_GROWTH: 'pri_growth',
      PADDLE_PRICE_SCALE: 'pri_scale',
    })).toThrow('Paddle checkout requires BILLING_MODE=postgres');
  });

  it('does not allow sandbox Paddle credentials in production', () => {
    expect(() => parseConfig({
      RUNTIME_ENV: 'production', AUTH_MODE: 'postgres', BILLING_MODE: 'postgres',
      RATE_LIMIT_MODE: 'redis', CHECKOUT_MODE: 'paddle',
      DATABASE_URL: 'postgresql://db/gateway', REDIS_URL: 'redis://cache',
      GATEWAY_KEY_PEPPER: 'p'.repeat(32), PADDLE_ENVIRONMENT: 'sandbox',
      PADDLE_API_KEY: 'pdl_test_secret', PADDLE_WEBHOOK_SECRET: 'notification-secret',
      PADDLE_CHECKOUT_URL: 'https://gateway.pink/checkout',
      PADDLE_PRICE_STARTER: 'pri_starter', PADDLE_PRICE_STANDARD: 'pri_standard',
      PADDLE_PRICE_GROWTH: 'pri_growth', PADDLE_PRICE_SCALE: 'pri_scale',
    })).toThrow('production requires PADDLE_ENVIRONMENT=production');
  });

  it('rejects postgres or Redis mode when its dependency URL is missing in development', () => {
    expect(() => parseConfig({ AUTH_MODE: 'postgres' })).toThrow('postgres auth requires DATABASE_URL');
    expect(() => parseConfig({ RATE_LIMIT_MODE: 'redis' })).toThrow('redis rate limiting requires REDIS_URL');
  });

  it('enables Textract only in the priced region with confirmed AI-services opt-out', () => {
    expect(() => parseConfig({ AWS_TEXTRACT_REGION: 'us-west-2' }))
      .toThrow('AWS Textract requires AWS_AI_SERVICES_OPT_OUT_CONFIRMED=true');
    expect(parseConfig({
      AWS_TEXTRACT_REGION: 'us-west-2', AWS_AI_SERVICES_OPT_OUT_CONFIRMED: 'true',
    })).toMatchObject({ awsTextractRegion: 'us-west-2', awsAiServicesOptOutConfirmed: true });
    expect(() => parseConfig({
      AWS_TEXTRACT_REGION: 'eu-west-1', AWS_AI_SERVICES_OPT_OUT_CONFIRMED: 'true',
    })).toThrow('invalid config');
  });
});
