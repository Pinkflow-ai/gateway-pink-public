import { describe, expect, it, vi } from 'vitest';
import { parseConfig } from '../../src/config.js';
import { createRuntimeResources } from '../../src/runtime/resources.js';

const productionConfig = parseConfig({
  RUNTIME_ENV: 'production',
  AUTH_MODE: 'postgres',
  BILLING_MODE: 'postgres',
  RATE_LIMIT_MODE: 'redis',
  DATABASE_URL: 'postgresql://gateway:test@db.example/gateway',
  REDIS_URL: 'redis://cache.example:6379',
  GATEWAY_KEY_PEPPER: 'p'.repeat(32),
});

describe('production runtime resources', () => {
  it('connects shared Postgres/Redis adapters, probes them, and closes cleanly', async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('from api_keys')) {
        return { rows: [{ id: 'key-1', org_id: 'org-1', mcp_enabled: false }], rowCount: 1 };
      }
      return { rows: [{ ok: 1 }], rowCount: 1 };
    });
    const end = vi.fn(async () => undefined);
    const connect = vi.fn(async () => undefined);
    const ping = vi.fn(async () => 'PONG');
    const quit = vi.fn(async () => undefined);
    const evalScript = vi.fn(async () => [1, 9, 0]);

    const resources = await createRuntimeResources(productionConfig, {
      createPostgres: () => ({ query, end }),
      createRedis: () => ({ connect, ping, quit, eval: evalScript, on: vi.fn() }),
    });

    expect(connect).toHaveBeenCalledOnce();
    await expect(resources.authenticator?.authenticate('gp_live_example')).resolves.toMatchObject({
      apiKeyId: 'key-1', orgId: 'org-1',
    });
    await expect(resources.readiness()).resolves.toEqual({ postgres: true, redis: true });
    expect(resources.paidDependencies?.meter.constructor.name).toBe('PostgresUsageMeter');
    expect(resources.rateLimitOptions?.network?.constructor.name).toBe('RedisSlidingWindowLimiter');

    await resources.close();
    expect(quit).toHaveBeenCalledOnce();
    expect(end).toHaveBeenCalledOnce();
  });

  it('reports dependency failure without throwing from readiness', async () => {
    const resources = await createRuntimeResources(productionConfig, {
      createPostgres: () => ({ query: vi.fn(async () => { throw new Error('db down'); }), end: vi.fn() }),
      createRedis: () => ({
        connect: vi.fn(async () => undefined), ping: vi.fn(async () => { throw new Error('redis down'); }),
        quit: vi.fn(), eval: vi.fn(), on: vi.fn(),
      }),
    });
    await expect(resources.readiness()).resolves.toEqual({ postgres: false, redis: false });
    await resources.close();
  });

  it('does not allocate external resources in development modes', async () => {
    const createPostgres = vi.fn();
    const createRedis = vi.fn();
    const resources = await createRuntimeResources(parseConfig({}), { createPostgres, createRedis });
    expect(createPostgres).not.toHaveBeenCalled();
    expect(createRedis).not.toHaveBeenCalled();
    expect(resources.authenticator).toBeUndefined();
    await expect(resources.readiness()).resolves.toEqual({ postgres: true, redis: true });
  });
});
