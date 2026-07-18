import type { PricingManifest } from '../billing/pricing.js';
import { policyFor } from '../policy/registry.js';
import { INPUT_SCHEMAS, type InputSchema } from './inputs.js';

export interface OpenApiOperation extends Record<string, unknown> {
  operationId: string;
  summary: string;
  tags: string[];
  security: Array<{ bearerAuth: never[] }>;
  parameters: Array<Record<string, unknown>>;
  requestBody?: { required: boolean; content: { 'application/json': { schema: InputSchema } } };
  responses: Record<string, unknown>;
  'x-gateway-storage-policy': string;
  'x-gateway-pricing': PricingManifest['routes'][string];
}

export interface OpenApiDocument {
  openapi: '3.1.0';
  info: { title: string; version: string; description: string };
  servers: Array<{ url: string; description: string }>;
  paths: Record<string, Partial<Record<'get' | 'post', OpenApiOperation>>>;
  components: Record<string, unknown>;
}

export function operationIdFor(route: string): string {
  const [, path] = route.split(' ');
  const words = path!.replace(/^\/v1\//, '').split(/[\/-]/).filter(Boolean);
  return words.map((word, index) => index === 0
    ? word.toLowerCase()
    : `${word[0]!.toUpperCase()}${word.slice(1)}`).join('');
}

function summaryFor(operationId: string): string {
  return operationId.replace(/([A-Z])/g, ' $1').replace(/^./, (value) => value.toUpperCase());
}

function queryParameters(schema: InputSchema): Array<Record<string, unknown>> {
  const required = new Set(schema.required ?? []);
  return Object.entries(schema.properties).map(([name, property]) => ({
    name,
    in: 'query',
    required: required.has(name),
    schema: property,
  }));
}

const errorResponse = {
  description: 'Gateway error',
  content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' } } },
};

export function generateOpenApi(manifest: PricingManifest): OpenApiDocument {
  const paths: OpenApiDocument['paths'] = {};
  for (const route of Object.keys(manifest.routes).sort()) {
    const [method, path] = route.split(' ') as ['GET' | 'POST', string];
    const pricing = manifest.routes[route]!;
    const policy = policyFor(route);
    const input = INPUT_SCHEMAS[route];
    if (!policy || !input) throw new Error(`developer contract missing metadata for ${route}`);
    const paid = pricing.kind !== 'free';
    const parameters: Array<Record<string, unknown>> = method === 'GET' ? queryParameters(input) : [];
    if (paid) {
      parameters.push({
        name: 'Idempotency-Key', in: 'header', required: true,
        schema: { type: 'string', minLength: 1, maxLength: 128, pattern: '^[A-Za-z0-9._:-]+$' },
      });
    }
    const operationId = operationIdFor(route);
    const operation: OpenApiOperation = {
      operationId,
      summary: summaryFor(operationId),
      tags: [path.split('/')[2] ?? 'gateway'],
      security: [{ bearerAuth: [] }],
      parameters,
      ...(method === 'POST' ? {
        requestBody: {
          required: true,
          content: { 'application/json': { schema: input } },
        },
      } : {}),
      responses: {
        '200': {
          description: 'Successful response',
          content: { 'application/json': { schema: { type: 'object', additionalProperties: true } } },
        },
        '400': errorResponse,
        '401': errorResponse,
        ...(paid ? { '402': errorResponse, '409': errorResponse } : {}),
        '429': errorResponse,
        '500': errorResponse,
        '503': errorResponse,
      },
      'x-gateway-storage-policy': policy.storagePolicy,
      'x-gateway-pricing': pricing,
    };
    paths[path] = { ...(paths[path] ?? {}), [method.toLowerCase()]: operation };
  }
  return {
    openapi: '3.1.0',
    info: {
      title: 'Gateway.pink API',
      version: `1.${manifest.version}.0`,
      description: 'One authenticated API for free compute/public data and margin-protected provider calls. One credit is $0.001 of API usage.',
    },
    servers: [{ url: 'https://api.gateway.pink', description: 'Production (available after public launch)' }],
    paths,
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'Gateway API key' },
      },
      schemas: {
        ErrorEnvelope: {
          type: 'object',
          required: ['error'],
          properties: {
            error: {
              type: 'object', required: ['code', 'message', 'request_id'],
              properties: {
                code: { type: 'string' }, message: { type: 'string' }, request_id: { type: 'string' },
              },
            },
          },
        },
      },
    },
  };
}
