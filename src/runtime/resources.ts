import pg from 'pg';
import { createClient } from 'redis';
import { PostgresApiKeyAuthenticator } from '../auth/postgres.js';
import type { ApiKeyAuthenticator } from '../auth/types.js';
import { principalForRequest } from '../auth/types.js';
import { PostgresUsageMeter } from '../billing/postgres.js';
import { PostgresFreeUsageRecorder, type FreeUsageRecorder } from '../billing/freeUsage.js';
import type { Config } from '../config.js';
import type { Queryable } from '../database/types.js';
import { logger } from '../log.js';
import { RedisSlidingWindowLimiter, type RedisScriptClient } from '../ratelimit/redis.js';
import type { RateLimitOptions } from '../ratelimit/slidingWindow.js';
import type { DependencyReadiness } from '../routes/health.js';
import { createPaidRouteDependencies } from '../routes/paid/runtime.js';
import type { PaidRouteDependencies } from '../routes/paid/index.js';

interface PostgresResource extends Queryable {
  end(): Promise<void>;
}

interface RedisResource extends RedisScriptClient {
  connect(): Promise<unknown>;
  ping(): Promise<string>;
  quit(): Promise<unknown>;
  on(event: 'error', listener: (error: Error) => void): unknown;
}

export interface RuntimeResourceFactories {
  createPostgres?: (config: Config) => PostgresResource;
  createRedis?: (config: Config) => RedisResource;
}

export interface RuntimeResources {
  authenticator?: ApiKeyAuthenticator;
  paidDependencies?: PaidRouteDependencies;
  freeUsageRecorder?: FreeUsageRecorder;
  rateLimitOptions?: RateLimitOptions;
  readiness: () => Promise<DependencyReadiness>;
  paidRoutesState: 'fail-closed' | 'development-meter' | 'durable';
  close: () => Promise<void>;
}

function defaultPostgres(config: Config): PostgresResource {
  return new pg.Pool({
    connectionString: config.databaseUrl,
    max: config.databasePoolMax,
    ssl: config.databaseSsl === 'require' ? { rejectUnauthorized: true } : false,
  }) as unknown as PostgresResource;
}

function defaultRedis(config: Config): RedisResource {
  return createClient({ url: config.redisUrl }) as unknown as RedisResource;
}

async function within<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('dependency probe timed out')), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function healthy(operation: () => Promise<unknown>, timeoutMs: number): Promise<boolean> {
  try {
    await within(operation(), timeoutMs);
    return true;
  } catch {
    return false;
  }
}

export async function createRuntimeResources(
  config: Config,
  factories: RuntimeResourceFactories = {},
): Promise<RuntimeResources> {
  const needsPostgres = config.authMode === 'postgres' || config.billingMode === 'postgres';
  const needsRedis = config.rateLimitMode === 'redis';
  const postgres = needsPostgres
    ? (factories.createPostgres ?? defaultPostgres)(config)
    : undefined;
  const redis = needsRedis
    ? (factories.createRedis ?? defaultRedis)(config)
    : undefined;

  if (redis) {
    redis.on('error', (error) => {
      logger.error({ event: 'redis_error', error: error.message });
    });
    await within(Promise.resolve(redis.connect()), config.dependencyTimeoutMs);
  }

  const authenticator = config.authMode === 'postgres' && postgres
    ? new PostgresApiKeyAuthenticator(postgres, config.apiKeyPepper)
    : undefined;
  const meter = config.billingMode === 'postgres' && postgres
    ? new PostgresUsageMeter(postgres)
    : undefined;
  const paidDependencies = meter
    ? createPaidRouteDependencies({ meter, identityForRequest: principalForRequest })
    : undefined;
  const freeUsageRecorder = postgres ? new PostgresFreeUsageRecorder(postgres) : undefined;
  const rateLimitOptions = redis
    ? {
        network: new RedisSlidingWindowLimiter(redis, 60_000, 'gateway:rate-limit:network'),
        routes: new RedisSlidingWindowLimiter(redis, 60_000, 'gateway:rate-limit:route'),
      }
    : undefined;

  let closed = false;
  return {
    authenticator,
    paidDependencies,
    freeUsageRecorder,
    rateLimitOptions,
    readiness: async () => ({
      postgres: postgres
        ? await healthy(() => postgres.query('select 1 as ok'), config.dependencyTimeoutMs)
        : true,
      redis: redis
        ? await healthy(async () => {
            const response = await redis.ping();
            if (response !== 'PONG') throw new Error('unexpected redis ping response');
          }, config.dependencyTimeoutMs)
        : true,
    }),
    paidRoutesState: config.billingMode === 'postgres' ? 'durable'
      : config.billingMode === 'memory' ? 'development-meter' : 'fail-closed',
    close: async () => {
      if (closed) return;
      closed = true;
      if (redis) await redis.quit();
      if (postgres) await postgres.end();
    },
  };
}
