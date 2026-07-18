import type { FastifyInstance } from 'fastify';
import { config } from '../config.js';

/** GET /health — liveness probe. Unauthenticated, no payload, no logging. */
export async function healthRoute(app: FastifyInstance): Promise<void> {
  app.get('/health', { config: { publicRoute: true } }, async () => ({ status: 'ok' }));
  app.get('/ready', { config: { publicRoute: true } }, async () => ({
    status: 'ready',
    paid_routes: config.billingMode === 'off' ? 'fail-closed' : 'development-meter',
  }));
}
