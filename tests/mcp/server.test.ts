import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadPricingManifest } from '../../src/billing/manifest.js';
import { createGatewayMcpServer, type GatewayMcpBackend } from '../../src/mcp/server.js';
import { operationIdFor } from '../../src/openapi/generate.js';

const connected: Array<{ client: Client; server: ReturnType<typeof createGatewayMcpServer> }> = [];

afterEach(async () => {
  await Promise.all(connected.splice(0).map(async ({ client, server }) => {
    await client.close();
    await server.close();
  }));
});

async function connect(backend: GatewayMcpBackend) {
  const server = createGatewayMcpServer(backend);
  const client = new Client({ name: 'gateway-test', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  connected.push({ client, server });
  return client;
}

describe('Gateway MCP server', () => {
  it('lists exactly the priced customer routes and no commercial control surfaces', async () => {
    const backend: GatewayMcpBackend = {
      checkEntitlement: vi.fn(async () => true),
      call: vi.fn(),
    };
    const client = await connect(backend);
    const result = await client.listTools();
    const manifest = loadPricingManifest('./config/pricing.manifest.json');
    expect(result.tools.map((tool) => tool.name).sort()).toEqual(
      Object.keys(manifest.routes).map(operationIdFor).sort(),
    );
    expect(result.tools.every((tool) => !/billing|checkout|webhook|admin/i.test(tool.name))).toBe(true);
    expect(backend.checkEntitlement).toHaveBeenCalledOnce();
  });

  it('refuses discovery when the API key is not entitled', async () => {
    const client = await connect({
      checkEntitlement: vi.fn(async () => false),
      call: vi.fn(),
    });
    await expect(client.listTools()).rejects.toThrow(/not enabled/i);
  });

  it('calls the shared SDK boundary with automatic paid idempotency and credit ceiling', async () => {
    const call = vi.fn(async () => ({ data: { deliverable: true } }));
    const client = await connect({ checkEntitlement: vi.fn(async () => true), call });
    const result = await client.callTool({
      name: 'emailValidate', arguments: { email: 'dev@example.com' },
    });
    expect(call).toHaveBeenCalledWith(
      'emailValidate',
      { email: 'dev@example.com' },
      expect.objectContaining({ idempotencyKey: expect.any(String), maxCredits: 17 }),
    );
    expect(result).toMatchObject({
      isError: false,
      structuredContent: { data: { deliverable: true } },
      content: [{ type: 'text', text: expect.stringContaining('deliverable') }],
    });
  });

  it('rejects arguments that do not satisfy the published tool schema', async () => {
    const call = vi.fn();
    const client = await connect({ checkEntitlement: vi.fn(async () => true), call });
    await expect(client.callTool({
      name: 'emailValidate', arguments: { email: 42 },
    })).rejects.toThrow(/invalid arguments/i);
    expect(call).not.toHaveBeenCalled();
  });
});
