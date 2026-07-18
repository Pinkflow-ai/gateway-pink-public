import { randomUUID } from 'node:crypto';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { Ajv, type ValidateFunction } from 'ajv';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { loadPricingManifest } from '../billing/manifest.js';
import type { PricingManifest } from '../billing/pricing.js';
import { INPUT_SCHEMAS } from '../openapi/inputs.js';
import { operationIdFor } from '../openapi/generate.js';
import {
  GatewayClient,
  GatewayError,
  type GatewayInput,
  type GatewayOperationId,
  type GatewayRequestOptions,
} from '../generated/gatewayClient.js';

export interface GatewayMcpBackend {
  checkEntitlement(): Promise<boolean>;
  call(
    operationId: GatewayOperationId,
    input: GatewayInput,
    options: GatewayRequestOptions,
  ): Promise<unknown>;
}

export interface HttpGatewayMcpBackendOptions {
  apiKey: string;
  baseUrl?: string;
  fetcher?: typeof fetch;
}

export class HttpGatewayMcpBackend implements GatewayMcpBackend {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetcher: typeof fetch;
  private readonly client: GatewayClient;

  constructor(options: HttpGatewayMcpBackendOptions) {
    if (!options.apiKey) throw new Error('GATEWAY_API_KEY is required');
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? 'https://api.gateway.pink').replace(/\/$/, '');
    this.fetcher = options.fetcher ?? fetch;
    this.client = new GatewayClient({
      apiKey: this.apiKey,
      baseUrl: this.baseUrl,
      fetcher: this.fetcher,
    });
  }

  async checkEntitlement(): Promise<boolean> {
    const response = await this.fetcher(`${this.baseUrl}/v1/mcp/entitlement`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
    if (response.status === 403) return false;
    if (!response.ok) throw new Error(`MCP entitlement check failed with HTTP ${response.status}`);
    const payload = await response.json() as { enabled?: unknown };
    return payload.enabled === true;
  }

  call(
    operationId: GatewayOperationId,
    input: GatewayInput,
    options: GatewayRequestOptions,
  ): Promise<unknown> {
    return this.client.call(operationId, input, options);
  }
}

interface McpToolDefinition {
  name: GatewayOperationId;
  description: string;
  inputSchema: (typeof INPUT_SCHEMAS)[string];
  paid: boolean;
  creditCeiling: number;
  validate: ValidateFunction<GatewayInput>;
}

function priceDescription(pricing: PricingManifest['routes'][string]): string {
  if (pricing.kind === 'free') return 'Free call.';
  if (pricing.kind === 'flat') return `Costs ${pricing.credits} credits ($${(pricing.credits / 1_000).toFixed(3)}).`;
  return `Metered call. Reserves at most ${pricing.reserveCredits} credits ($${(pricing.reserveCredits / 1_000).toFixed(3)}) and refunds unused credits.`;
}

function toolDefinitions(manifest: PricingManifest): McpToolDefinition[] {
  const ajv = new Ajv({
    allErrors: true,
    strict: false,
    formats: { email: true, uri: true, 'date-time': true },
  });
  return Object.entries(manifest.routes).sort().map(([route, pricing]) => {
    const inputSchema = INPUT_SCHEMAS[route];
    if (!inputSchema) throw new Error(`MCP input schema missing for ${route}`);
    return {
      name: operationIdFor(route) as GatewayOperationId,
      description: `${priceDescription(pricing)} Gateway.pink operation ${route}.`,
      inputSchema,
      paid: pricing.kind !== 'free',
      creditCeiling: pricing.kind === 'free' ? 0
        : pricing.kind === 'flat' ? pricing.credits : pricing.reserveCredits,
      validate: ajv.compile<GatewayInput>(inputSchema),
    };
  });
}

function structuredPayload(payload: unknown): Record<string, unknown> {
  return payload !== null && typeof payload === 'object' && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : { result: payload };
}

async function requireEntitlement(backend: GatewayMcpBackend): Promise<void> {
  let enabled: boolean;
  try {
    enabled = await backend.checkEntitlement();
  } catch {
    throw new McpError(ErrorCode.InternalError, 'Gateway MCP entitlement verification is unavailable');
  }
  if (!enabled) {
    throw new McpError(ErrorCode.InvalidRequest, 'Gateway MCP access is not enabled for this API key');
  }
}

export function createGatewayMcpServer(
  backend: GatewayMcpBackend,
  manifest: PricingManifest = loadPricingManifest('./config/pricing.manifest.json'),
): Server {
  const tools = toolDefinitions(manifest);
  const toolsByName = new Map(tools.map((tool) => [tool.name, tool]));
  const server = new Server(
    { name: 'gateway-pink', title: 'Gateway.pink', version: '0.1.0' },
    {
      capabilities: { tools: {} },
      instructions: 'Use Gateway.pink tools for explicit API operations. Paid tool descriptions state their maximum charge. Never call billing, webhook, or administrative controls.',
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    await requireEntitlement(backend);
    return {
      tools: tools.map(({ name, description, inputSchema }) => ({
        name,
        title: name.replace(/([A-Z])/g, ' $1').replace(/^./, (value) => value.toUpperCase()),
        description,
        inputSchema,
      })),
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    await requireEntitlement(backend);
    const tool = toolsByName.get(request.params.name as GatewayOperationId);
    if (!tool) throw new McpError(ErrorCode.InvalidParams, `Unknown Gateway.pink tool: ${request.params.name}`);
    const input = (request.params.arguments ?? {}) as GatewayInput;
    if (!tool.validate(input)) {
      throw new McpError(ErrorCode.InvalidParams, `Invalid arguments for Gateway.pink tool: ${tool.name}`);
    }
    const options: GatewayRequestOptions = tool.paid
      ? { idempotencyKey: randomUUID(), maxCredits: tool.creditCeiling }
      : {};
    try {
      const payload = await backend.call(tool.name, input, options);
      const structuredContent = structuredPayload(payload);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(structuredContent) }],
        structuredContent,
        isError: false,
      };
    } catch (error) {
      const message = error instanceof GatewayError
        ? `Gateway API returned HTTP ${error.status}`
        : 'Gateway API call failed';
      return { content: [{ type: 'text' as const, text: message }], isError: true };
    }
  });

  return server;
}
