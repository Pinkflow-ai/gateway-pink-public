import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { bearerAuth } from '../../src/auth/bearer.js';

const principal = { apiKeyId: 'key-1', orgId: 'org-1', mcpEnabled: false };

async function appFor(authenticate: (token: string) => Promise<typeof principal | null>) {
  const app = Fastify();
  await bearerAuth(app, { authenticate });
  app.get('/private', async (request) => ({ principal: request.gatewayPrincipal }));
  app.get('/public', { config: { publicRoute: true } }, async () => ({ ok: true }));
  await app.ready();
  return app;
}

describe('bearer authentication', () => {
  it('attaches the resolved principal to authenticated requests', async () => {
    const authenticate = vi.fn(async () => principal);
    const app = await appFor(authenticate);
    const response = await app.inject({
      method: 'GET', url: '/private', headers: { authorization: 'Bearer gp_live_valid' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ principal });
    expect(authenticate).toHaveBeenCalledWith('gp_live_valid');
    await app.close();
  });

  it('rejects missing, malformed, unknown, and whitespace-padded credentials', async () => {
    const app = await appFor(async () => null);
    for (const authorization of [undefined, 'Basic abc', 'Bearer', 'Bearer ', 'Bearer  gp_live_x', 'Bearer gp_live_x ']) {
      const response = await app.inject({
        method: 'GET', url: '/private', headers: authorization ? { authorization } : {},
      });
      expect(response.statusCode).toBe(401);
      expect(response.json().error.code).toBe('unauthorized');
    }
    await app.close();
  });

  it('bypasses authentication for explicitly public routes', async () => {
    const authenticate = vi.fn(async () => principal);
    const app = await appFor(authenticate);
    expect((await app.inject('/public')).statusCode).toBe(200);
    expect(authenticate).not.toHaveBeenCalled();
    await app.close();
  });

  it('returns a generic dependency error without leaking the credential', async () => {
    const authenticate = vi.fn(async () => {
      throw new Error('database unavailable for gp_live_do_not_echo');
    });
    const app = await appFor(authenticate);
    const response = await app.inject({
      method: 'GET', url: '/private', headers: { authorization: 'Bearer gp_live_do_not_echo' },
    });
    expect(response.statusCode).toBe(503);
    expect(response.json().error).toMatchObject({
      code: 'auth_unavailable', message: 'api key verification is unavailable',
    });
    expect(response.body).not.toContain('gp_live_do_not_echo');
    await app.close();
  });
});
