import { describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';

describe('MCP entitlement boundary', () => {
  it('returns the durable API-key entitlement without exposing organization data', async () => {
    const app = await buildApp({
      authenticator: {
        authenticate: async () => ({ apiKeyId: 'key-1', orgId: 'org-1', mcpEnabled: true }),
      },
    });
    const response = await app.inject({
      method: 'GET', url: '/v1/mcp/entitlement', headers: { authorization: 'Bearer gp_test' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ enabled: true });
    await app.close();
  });

  it('denies a key that has not earned the MCP entitlement', async () => {
    const app = await buildApp({
      authenticator: {
        authenticate: async () => ({ apiKeyId: 'key-1', orgId: 'org-1', mcpEnabled: false }),
      },
    });
    const response = await app.inject({
      method: 'GET', url: '/v1/mcp/entitlement', headers: { authorization: 'Bearer gp_test' },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ error: { code: 'mcp_not_enabled' } });
    await app.close();
  });
});
