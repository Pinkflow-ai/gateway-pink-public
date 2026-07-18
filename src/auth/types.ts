import type { FastifyRequest } from 'fastify';

export interface ApiPrincipal {
  apiKeyId: string;
  orgId: string;
  mcpEnabled: boolean;
}

export interface ApiKeyAuthenticator {
  authenticate(token: string): Promise<ApiPrincipal | null>;
}

declare module 'fastify' {
  interface FastifyRequest {
    gatewayPrincipal: ApiPrincipal | null;
  }
}

export function principalForRequest(request: FastifyRequest): ApiPrincipal {
  if (!request.gatewayPrincipal) throw new Error('authenticated principal is unavailable');
  return request.gatewayPrincipal;
}
