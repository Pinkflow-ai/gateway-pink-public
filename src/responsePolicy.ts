import type { FastifyInstance } from 'fastify';
import { policyFor } from './policy/registry.js';

/**
 * Apply response privacy headers before auth, rate-limit, validation, or provider
 * code can terminate a customer request.
 */
export async function responsePolicy(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', async (req, reply) => {
    const template = req.routeOptions?.url;
    const route = template ? `${req.method} ${template}` : undefined;
    const policy = route ? policyFor(route) : undefined;
    if (!policy) return;

    reply.header('Cache-Control', 'no-store, private');
    reply.header('X-Gateway-Storage-Policy', policy.storagePolicy);
    if (policy.storagePolicy === 'none') reply.header('X-Gateway-No-Store', 'true');
    reply.header('X-Request-Id', req.id);
  });
}
