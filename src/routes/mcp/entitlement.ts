import type { FastifyInstance } from 'fastify';
import { makeError } from '../../lib/errors.js';

export async function mcpEntitlementRoute(app: FastifyInstance): Promise<void> {
  app.get('/v1/mcp/entitlement', async (request, reply) => {
    if (!request.gatewayPrincipal?.mcpEnabled) {
      return reply.code(403).send(makeError(
        'mcp_not_enabled',
        'MCP access is not enabled for this API key',
        request.id,
      ));
    }
    return { enabled: true };
  });
}
