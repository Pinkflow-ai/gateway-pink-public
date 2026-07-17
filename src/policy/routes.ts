import type { FastifyInstance } from 'fastify';
import { storagePolicyTable } from './registry.js';

/**
 * GET /v1/storage-policy — proof #3 on the trust page.
 * Returns the per-API storage posture, machine-readable. A security reviewer
 * pulls this to see what each endpoint does with the payload.
 *
 * No auth — the whole point is that this is inspectable.
 */
export async function policyRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/v1/storage-policy',
    { config: { publicRoute: true } },
    async () => ({ policies: storagePolicyTable }),
  );
}
