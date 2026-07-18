import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadPricingManifest } from '../src/billing/manifest.js';
import { generateOpenApi, operationIdFor } from '../src/openapi/generate.js';
import { ROUTE_POLICIES } from '../src/policy/registry.js';

describe('generated OpenAPI contract', () => {
  it('contains every priced customer route exactly once with unique operation IDs', () => {
    const manifest = loadPricingManifest('./config/pricing.manifest.json');
    const document = generateOpenApi(manifest);
    const operations = Object.entries(document.paths).flatMap(([path, methods]) =>
      Object.entries(methods).map(([method, operation]) => ({ path, method, operation })),
    );
    expect(document.openapi).toBe('3.1.0');
    expect(operations.map(({ method, path }) => `${method.toUpperCase()} ${path}`).sort())
      .toEqual(Object.keys(manifest.routes).sort());
    expect(new Set(operations.map(({ operation }) => operation.operationId)).size)
      .toBe(operations.length);
    expect(ROUTE_POLICIES).toHaveLength(operations.length);
  });

  it('publishes auth, storage, pricing, idempotency, and spending-cap metadata', () => {
    const manifest = loadPricingManifest('./config/pricing.manifest.json');
    const document = generateOpenApi(manifest);
    const email = document.paths['/v1/email/validate']!.post!;
    expect(email.security).toEqual([{ bearerAuth: [] }]);
    expect(email['x-gateway-storage-policy']).toBe('metadata-only');
    expect(email['x-gateway-pricing']).toEqual({ kind: 'flat', credits: 17 });
    expect(email.parameters).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'Idempotency-Key', in: 'header', required: true }),
    ]));
    const ai = document.paths['/v1/ai/summarize']!.post!;
    expect(ai.requestBody?.content['application/json'].schema.properties).toHaveProperty('max_credits');
    expect(ai['x-gateway-pricing']).toMatchObject({ targetMarginBps: 8000, reserveCredits: 100 });
    expect(document.paths['/v1/compute/hash']!.post!['x-gateway-storage-policy']).toBe('none');
  });

  it('keeps the checked-in artifact deterministic', () => {
    const manifest = loadPricingManifest('./config/pricing.manifest.json');
    const checkedIn = JSON.parse(readFileSync(resolve('openapi/gateway.openapi.json'), 'utf8'));
    expect(checkedIn).toEqual(generateOpenApi(manifest));
    expect(operationIdFor('POST /v1/compute/json-schema')).toBe('computeJsonSchema');
  });
});
