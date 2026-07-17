import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../config.js';
import { makeError } from '../lib/errors.js';

/**
 * Dev-only bearer auth. Keys come from GATEWAY_DEV_KEYS (comma list in env).
 * The real key store — hashed keys in Postgres with O(1) revocation — is part
 * of the private repo, not this public one.
 *
 * Public, unauthenticated routes (health, storage-policy) opt out via
 * `routeOptions.config.publicRoute = true`.
 */
export async function bearerAuth(app: FastifyInstance): Promise<void> {
  // If no dev keys are configured, every request is anonymous. Useful for
  // running the compute-only routes locally with zero setup.
  const acceptedKeys = new Set(config.devKeys);

  app.addHook('onRequest', async (req: FastifyRequest, reply: FastifyReply) => {
    if ((req.routeOptions?.config as { publicRoute?: boolean } | undefined)?.publicRoute) {
      return;
    }
    if (acceptedKeys.size === 0) return; // open mode

    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token || !acceptedKeys.has(token)) {
      reply.code(401).send(makeError('unauthorized', 'missing or invalid api key', req.id));
    }
  });
}
