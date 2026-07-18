import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { createHash } from 'node:crypto';
import { config } from '../config.js';
import { makeError } from '../lib/errors.js';
import type { ApiKeyAuthenticator, ApiPrincipal } from './types.js';
import './types.js';

/**
 * Dev-only bearer auth. Keys come from GATEWAY_DEV_KEYS (comma list in env).
 * The real key store — hashed keys in Postgres with O(1) revocation — is part
 * of the private repo, not this public one.
 *
 * Public, unauthenticated routes (health, storage-policy) opt out via
 * `routeOptions.config.publicRoute = true`.
 */
export interface BearerAuthOptions extends Partial<ApiKeyAuthenticator> {}

function developmentPrincipal(token: string): ApiPrincipal {
  const fingerprint = createHash('sha256').update(token).digest('hex').slice(0, 24);
  return { apiKeyId: `dev-${fingerprint}`, orgId: 'org-dev', mcpEnabled: false };
}

function bearerToken(header: string | undefined): string | null {
  const match = header?.match(/^Bearer ([^\s]+)$/);
  return match?.[1] ?? null;
}

export async function bearerAuth(app: FastifyInstance, options: BearerAuthOptions = {}): Promise<void> {
  // If no dev keys are configured, every request is anonymous. Useful for
  // running the compute-only routes locally with zero setup.
  const acceptedKeys = new Set(config.devKeys);
  app.decorateRequest('gatewayPrincipal', null);

  app.addHook('onRequest', async (req: FastifyRequest, reply: FastifyReply) => {
    if ((req.routeOptions?.config as { publicRoute?: boolean } | undefined)?.publicRoute) {
      return;
    }
    if (!options.authenticate && acceptedKeys.size === 0) return; // open mode

    const token = bearerToken(req.headers.authorization);
    if (!token) {
      await reply.code(401).send(makeError('unauthorized', 'missing or invalid api key', req.id));
      return;
    }

    try {
      const principal = options.authenticate
        ? await options.authenticate(token)
        : acceptedKeys.has(token) ? developmentPrincipal(token) : null;
      if (!principal) {
        await reply.code(401).send(makeError('unauthorized', 'missing or invalid api key', req.id));
        return;
      }
      req.gatewayPrincipal = principal;
    } catch {
      await reply.code(503).send(makeError(
        'auth_unavailable', 'api key verification is unavailable', req.id,
      ));
    }
  });
}
