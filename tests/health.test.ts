import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';

describe('health probes', () => {
  it('distinguishes liveness from initialized readiness', async () => {
    const app = await buildApp();
    expect((await app.inject('/health')).json()).toEqual({ status: 'ok' });
    expect((await app.inject('/ready')).json()).toEqual({ status: 'ready', paid_routes: 'fail-closed' });
    await app.close();
  });
});
