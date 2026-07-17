import type { FastifyInstance } from 'fastify';

/** GET /health — liveness probe. Unauthenticated, no payload, no logging. */
export async function healthRoute(app: FastifyInstance): Promise<void> {
  app.get('/health', { config: { publicRoute: true } }, async () => ({ status: 'ok' }));
}
