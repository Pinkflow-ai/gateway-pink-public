import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';

describe('health probes', () => {
  it('distinguishes liveness from initialized readiness', async () => {
    const app = await buildApp();
    expect((await app.inject('/health')).json()).toEqual({ status: 'ok' });
    expect((await app.inject('/ready')).json()).toEqual({ status: 'ready', paid_routes: 'fail-closed' });
    await app.close();
  });

  it('returns 503 until required production dependencies are ready', async () => {
    const app = await buildApp({
      readiness: async () => ({ postgres: false, redis: true }),
      paidRoutesState: 'durable',
    });
    expect((await app.inject('/health')).statusCode).toBe(200);
    const response = await app.inject('/ready');
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      status: 'not_ready', paid_routes: 'durable',
      dependencies: { postgres: 'unavailable', redis: 'ok' },
    });
    await app.close();
  });

  it('reports durable readiness only when Postgres and Redis both respond', async () => {
    const app = await buildApp({
      readiness: async () => ({ postgres: true, redis: true }),
      paidRoutesState: 'durable',
    });
    const response = await app.inject('/ready');
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: 'ready', paid_routes: 'durable',
      dependencies: { postgres: 'ok', redis: 'ok' },
    });
    await app.close();
  });
});
