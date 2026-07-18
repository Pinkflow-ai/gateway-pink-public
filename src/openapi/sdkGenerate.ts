import type { PricingManifest } from '../billing/pricing.js';
import { operationIdFor } from './generate.js';

interface Operation {
  method: 'GET' | 'POST';
  path: string;
  paid: boolean;
  creditCeiling: number;
}

function operations(manifest: PricingManifest): Record<string, Operation> {
  return Object.fromEntries(Object.entries(manifest.routes).sort().map(([route, pricing]) => {
    const [method, path] = route.split(' ') as ['GET' | 'POST', string];
    const creditCeiling = pricing.kind === 'free' ? 0
      : pricing.kind === 'flat' ? pricing.credits : pricing.reserveCredits;
    return [operationIdFor(route), { method, path, paid: pricing.kind !== 'free', creditCeiling }];
  }));
}

export function generateTypeScriptSdk(manifest: PricingManifest): string {
  const entries = operations(manifest);
  const methods = Object.keys(entries).map((operationId) => `
  ${operationId}(input: GatewayInput = {}, options: GatewayRequestOptions = {}): Promise<unknown> {
    return this.call('${operationId}', input, options);
  }`).join('\n');
  return `// Generated from config/pricing.manifest.json. Do not edit by hand.
export const OPERATIONS = ${JSON.stringify(entries, null, 2)} as const;

export type GatewayOperationId = keyof typeof OPERATIONS;
export type GatewayInput = Record<string, unknown>;

export interface GatewayRequestOptions {
  idempotencyKey?: string;
  maxCredits?: number;
  signal?: AbortSignal;
}

export interface GatewayClientOptions {
  baseUrl?: string;
  apiKey: string;
  fetcher?: typeof fetch;
}

export class GatewayError extends Error {
  constructor(public readonly status: number, public readonly payload: unknown) {
    super(\`Gateway request failed with HTTP \${status}\`);
  }
}

export class GatewayClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly fetcher: typeof fetch;

  constructor(options: GatewayClientOptions) {
    this.baseUrl = (options.baseUrl ?? 'https://api.gateway.pink').replace(/\\/$/, '');
    this.apiKey = options.apiKey;
    this.fetcher = options.fetcher ?? fetch;
    if (!this.apiKey) throw new Error('apiKey is required');
  }

  async call(operationId: GatewayOperationId, input: GatewayInput = {}, options: GatewayRequestOptions = {}): Promise<unknown> {
    const operation = OPERATIONS[operationId];
    if (operation.paid && !options.idempotencyKey) throw new Error('idempotencyKey is required for paid operations');
    if (options.maxCredits !== undefined) {
      if (!Number.isSafeInteger(options.maxCredits) || options.maxCredits < 1) throw new Error('maxCredits must be a positive integer');
      if (operation.creditCeiling > options.maxCredits) throw new Error(\`operation credit ceiling \${operation.creditCeiling} exceeds maxCredits\`);
    }
    const requestInput = operationId === 'aiSummarize' && options.maxCredits !== undefined
      ? { ...input, max_credits: Math.min(Number(input.max_credits ?? options.maxCredits), options.maxCredits) }
      : input;
    const url = new URL(\`\${this.baseUrl}\${operation.path}\`);
    const headers: Record<string, string> = { Authorization: \`Bearer \${this.apiKey}\` };
    let body: string | undefined;
    if (operation.method === 'GET') {
      for (const [name, value] of Object.entries(requestInput)) {
        if (value !== undefined && value !== null) url.searchParams.set(name, String(value));
      }
    } else {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(requestInput);
    }
    if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;
    const response = await this.fetcher(url, {
      method: operation.method, headers, ...(body === undefined ? {} : { body }), signal: options.signal,
    });
    let payload: unknown = null;
    try { payload = await response.json(); } catch { /* preserve null for invalid upstream JSON */ }
    if (!response.ok) throw new GatewayError(response.status, payload);
    return payload;
  }
${methods}
}
`;
}

function snake(value: string): string {
  return value.replace(/([A-Z])/g, '_$1').toLowerCase();
}

export function generatePythonSdk(manifest: PricingManifest): string {
  const entries = operations(manifest);
  const methods = Object.keys(entries).map((operationId) => `
    def ${snake(operationId)}(self, input=None, *, idempotency_key=None, max_credits=None):
        return self.call("${operationId}", input, idempotency_key=idempotency_key, max_credits=max_credits)
`).join('');
  const pythonOperations = JSON.stringify(entries, null, 2)
    .replaceAll('true', 'True').replaceAll('false', 'False');
  return `# Generated from config/pricing.manifest.json. Do not edit by hand.
import json
from urllib import error, parse, request

OPERATIONS = ${pythonOperations}


class GatewayError(Exception):
    def __init__(self, status, payload):
        super().__init__(f"Gateway request failed with HTTP {status}")
        self.status = status
        self.payload = payload


class GatewayClient:
    def __init__(self, api_key, base_url="https://api.gateway.pink", timeout=30):
        if not api_key:
            raise ValueError("api_key is required")
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout

    def call(self, operation_id, input=None, *, idempotency_key=None, max_credits=None):
        operation = OPERATIONS[operation_id]
        values = dict(input or {})
        if operation["paid"] and not idempotency_key:
            raise ValueError("idempotency_key is required for paid operations")
        if max_credits is not None:
            if not isinstance(max_credits, int) or max_credits < 1:
                raise ValueError("max_credits must be a positive integer")
            if operation["creditCeiling"] > max_credits:
                raise ValueError(f"operation credit ceiling {operation['creditCeiling']} exceeds max_credits")
        if operation_id == "aiSummarize" and max_credits is not None:
            values["max_credits"] = min(int(values.get("max_credits", max_credits)), max_credits)
        url = self.base_url + operation["path"]
        headers = {"Authorization": "Bearer " + self.api_key}
        data = None
        if operation["method"] == "GET":
            if values:
                url += "?" + parse.urlencode(values)
        else:
            headers["Content-Type"] = "application/json"
            data = json.dumps(values).encode("utf-8")
        if idempotency_key:
            headers["Idempotency-Key"] = idempotency_key
        outgoing = request.Request(url, data=data, headers=headers, method=operation["method"])
        try:
            with request.urlopen(outgoing, timeout=self.timeout) as response:
                return json.loads(response.read().decode("utf-8"))
        except error.HTTPError as failure:
            try:
                payload = json.loads(failure.read().decode("utf-8"))
            except Exception:
                payload = None
            raise GatewayError(failure.code, payload) from failure
${methods}
`;
}
