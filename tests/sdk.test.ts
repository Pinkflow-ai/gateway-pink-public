import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadPricingManifest } from '../src/billing/manifest.js';
import { operationIdFor } from '../src/openapi/generate.js';
import { GatewayClient, OPERATIONS } from '../sdks/typescript/src/index.js';

describe('generated Gateway SDKs', () => {
  it('keeps TypeScript and Python operations in parity with the runtime manifest', () => {
    const manifest = loadPricingManifest('./config/pricing.manifest.json');
    const expected = Object.keys(manifest.routes).map(operationIdFor).sort();
    expect(Object.keys(OPERATIONS).sort()).toEqual(expected);
    const python = readFileSync(resolve('sdks/python/gateway_pink/client.py'), 'utf8');
    for (const operationId of expected) {
      expect(python).toContain(`"${operationId}"`);
    }
    execFileSync('python3', [
      '-c',
      "import ast,pathlib; ast.parse(pathlib.Path('sdks/python/gateway_pink/client.py').read_text())",
    ]);
  });

  it('calls an injected local Fastify route without network access', async () => {
    const app = await buildApp();
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input));
      const response = await app.inject({
        method: (init?.method ?? 'GET') as 'GET' | 'POST',
        url: `${url.pathname}${url.search}`,
        headers: Object.fromEntries(new Headers(init?.headers).entries()),
        payload: init?.body ? JSON.parse(String(init.body)) : undefined,
      });
      return new Response(response.body, {
        status: response.statusCode,
        headers: response.headers as Record<string, string>,
      });
    });
    const client = new GatewayClient({
      baseUrl: 'http://gateway.local', apiKey: 'gp_test', fetcher,
    });
    await expect(client.computeHash({ input: 'hello', algorithm: 'sha256' }))
      .resolves.toMatchObject({ data: { algorithm: 'sha256' } });
    expect(fetcher).toHaveBeenCalledOnce();
    await app.close();
  });

  it('enforces paid idempotency and caller spending caps before a request', async () => {
    const fetcher = vi.fn(async () => new Response('{}', { status: 200 }));
    const client = new GatewayClient({ baseUrl: 'https://api.gateway.pink', apiKey: 'gp_test', fetcher });
    await expect(client.emailValidate({ email: 'dev@example.com' }))
      .rejects.toThrow('idempotencyKey');
    await expect(client.emailValidate(
      { email: 'dev@example.com' },
      { idempotencyKey: 'email-1', maxCredits: 16 },
    )).rejects.toThrow('credit ceiling');
    expect(fetcher).not.toHaveBeenCalled();
  });
});
