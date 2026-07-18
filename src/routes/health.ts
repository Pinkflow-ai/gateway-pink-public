import type { FastifyInstance } from 'fastify';
import { config } from '../config.js';

export interface DependencyReadiness {
  postgres: boolean;
  redis: boolean;
}

export interface HealthRouteOptions {
  readiness?: () => Promise<DependencyReadiness>;
  paidRoutesState?: 'fail-closed' | 'development-meter' | 'durable';
}

/** GET /health — liveness probe. Unauthenticated, no payload, no logging. */
export async function healthRoute(app: FastifyInstance, options: HealthRouteOptions): Promise<void> {
  app.get('/health', { config: { publicRoute: true } }, async () => ({ status: 'ok' }));
  app.get('/ready', { config: { publicRoute: true } }, async (_request, reply) => {
    const paidRoutes = options.paidRoutesState
      ?? (config.billingMode === 'off' ? 'fail-closed'
        : config.billingMode === 'memory' ? 'development-meter' : 'durable');
    if (!options.readiness) return { status: 'ready', paid_routes: paidRoutes };
    const dependencies = await options.readiness();
    const ready = dependencies.postgres && dependencies.redis;
    if (!ready) reply.code(503);
    return {
      status: ready ? 'ready' : 'not_ready',
      paid_routes: paidRoutes,
      dependencies: {
        postgres: dependencies.postgres ? 'ok' : 'unavailable',
        redis: dependencies.redis ? 'ok' : 'unavailable',
      },
    };
  });
}
