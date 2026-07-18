// Generated from config/pricing.manifest.json. Do not edit by hand.
export const OPERATIONS = {
  "computeDummy": {
    "method": "GET",
    "path": "/v1/compute/dummy",
    "paid": false,
    "creditCeiling": 0
  },
  "computePassword": {
    "method": "GET",
    "path": "/v1/compute/password",
    "paid": false,
    "creditCeiling": 0
  },
  "computeTime": {
    "method": "GET",
    "path": "/v1/compute/time",
    "paid": false,
    "creditCeiling": 0
  },
  "computeUa": {
    "method": "GET",
    "path": "/v1/compute/ua",
    "paid": false,
    "creditCeiling": 0
  },
  "computeUuid": {
    "method": "GET",
    "path": "/v1/compute/uuid",
    "paid": false,
    "creditCeiling": 0
  },
  "currencyConvert": {
    "method": "GET",
    "path": "/v1/currency/convert",
    "paid": false,
    "creditCeiling": 0
  },
  "dnsResolve": {
    "method": "GET",
    "path": "/v1/dns/resolve",
    "paid": false,
    "creditCeiling": 0
  },
  "phoneLookup": {
    "method": "GET",
    "path": "/v1/phone/lookup",
    "paid": true,
    "creditCeiling": 40
  },
  "phoneValidate": {
    "method": "GET",
    "path": "/v1/phone/validate",
    "paid": false,
    "creditCeiling": 0
  },
  "weather": {
    "method": "GET",
    "path": "/v1/weather",
    "paid": false,
    "creditCeiling": 0
  },
  "whoisLookup": {
    "method": "GET",
    "path": "/v1/whois/lookup",
    "paid": false,
    "creditCeiling": 0
  },
  "aiSummarize": {
    "method": "POST",
    "path": "/v1/ai/summarize",
    "paid": true,
    "creditCeiling": 100
  },
  "browserMarkdown": {
    "method": "POST",
    "path": "/v1/browser/markdown",
    "paid": true,
    "creditCeiling": 3
  },
  "browserPdf": {
    "method": "POST",
    "path": "/v1/browser/pdf",
    "paid": true,
    "creditCeiling": 6
  },
  "browserScreenshot": {
    "method": "POST",
    "path": "/v1/browser/screenshot",
    "paid": true,
    "creditCeiling": 6
  },
  "computeBase64": {
    "method": "POST",
    "path": "/v1/compute/base64",
    "paid": false,
    "creditCeiling": 0
  },
  "computeColor": {
    "method": "POST",
    "path": "/v1/compute/color",
    "paid": false,
    "creditCeiling": 0
  },
  "computeCsv": {
    "method": "POST",
    "path": "/v1/compute/csv",
    "paid": false,
    "creditCeiling": 0
  },
  "computeHash": {
    "method": "POST",
    "path": "/v1/compute/hash",
    "paid": false,
    "creditCeiling": 0
  },
  "computeHmac": {
    "method": "POST",
    "path": "/v1/compute/hmac",
    "paid": false,
    "creditCeiling": 0
  },
  "computeHtml": {
    "method": "POST",
    "path": "/v1/compute/html",
    "paid": false,
    "creditCeiling": 0
  },
  "computeJson": {
    "method": "POST",
    "path": "/v1/compute/json",
    "paid": false,
    "creditCeiling": 0
  },
  "computeJsonSchema": {
    "method": "POST",
    "path": "/v1/compute/json-schema",
    "paid": false,
    "creditCeiling": 0
  },
  "computeJwtDecode": {
    "method": "POST",
    "path": "/v1/compute/jwt/decode",
    "paid": false,
    "creditCeiling": 0
  },
  "computeQr": {
    "method": "POST",
    "path": "/v1/compute/qr",
    "paid": false,
    "creditCeiling": 0
  },
  "computeSlug": {
    "method": "POST",
    "path": "/v1/compute/slug",
    "paid": false,
    "creditCeiling": 0
  },
  "computeTextStats": {
    "method": "POST",
    "path": "/v1/compute/text-stats",
    "paid": false,
    "creditCeiling": 0
  },
  "computeUnits": {
    "method": "POST",
    "path": "/v1/compute/units",
    "paid": false,
    "creditCeiling": 0
  },
  "computeUrl": {
    "method": "POST",
    "path": "/v1/compute/url",
    "paid": false,
    "creditCeiling": 0
  },
  "emailValidate": {
    "method": "POST",
    "path": "/v1/email/validate",
    "paid": true,
    "creditCeiling": 17
  },
  "screenshot": {
    "method": "POST",
    "path": "/v1/screenshot",
    "paid": true,
    "creditCeiling": 45
  },
  "securityPasswordExposure": {
    "method": "POST",
    "path": "/v1/security/password-exposure",
    "paid": false,
    "creditCeiling": 0
  }
} as const;

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
    super(`Gateway request failed with HTTP ${status}`);
  }
}

export class GatewayClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly fetcher: typeof fetch;

  constructor(options: GatewayClientOptions) {
    this.baseUrl = (options.baseUrl ?? 'https://api.gateway.pink').replace(/\/$/, '');
    this.apiKey = options.apiKey;
    this.fetcher = options.fetcher ?? fetch;
    if (!this.apiKey) throw new Error('apiKey is required');
  }

  async call(operationId: GatewayOperationId, input: GatewayInput = {}, options: GatewayRequestOptions = {}): Promise<unknown> {
    const operation = OPERATIONS[operationId];
    if (operation.paid && !options.idempotencyKey) throw new Error('idempotencyKey is required for paid operations');
    if (options.maxCredits !== undefined) {
      if (!Number.isSafeInteger(options.maxCredits) || options.maxCredits < 1) throw new Error('maxCredits must be a positive integer');
      if (operation.creditCeiling > options.maxCredits) throw new Error(`operation credit ceiling ${operation.creditCeiling} exceeds maxCredits`);
    }
    const requestInput = operationId === 'aiSummarize' && options.maxCredits !== undefined
      ? { ...input, max_credits: Math.min(Number(input.max_credits ?? options.maxCredits), options.maxCredits) }
      : input;
    const url = new URL(`${this.baseUrl}${operation.path}`);
    const headers: Record<string, string> = { Authorization: `Bearer ${this.apiKey}` };
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

  computeDummy(input: GatewayInput = {}, options: GatewayRequestOptions = {}): Promise<unknown> {
    return this.call('computeDummy', input, options);
  }

  computePassword(input: GatewayInput = {}, options: GatewayRequestOptions = {}): Promise<unknown> {
    return this.call('computePassword', input, options);
  }

  computeTime(input: GatewayInput = {}, options: GatewayRequestOptions = {}): Promise<unknown> {
    return this.call('computeTime', input, options);
  }

  computeUa(input: GatewayInput = {}, options: GatewayRequestOptions = {}): Promise<unknown> {
    return this.call('computeUa', input, options);
  }

  computeUuid(input: GatewayInput = {}, options: GatewayRequestOptions = {}): Promise<unknown> {
    return this.call('computeUuid', input, options);
  }

  currencyConvert(input: GatewayInput = {}, options: GatewayRequestOptions = {}): Promise<unknown> {
    return this.call('currencyConvert', input, options);
  }

  dnsResolve(input: GatewayInput = {}, options: GatewayRequestOptions = {}): Promise<unknown> {
    return this.call('dnsResolve', input, options);
  }

  phoneLookup(input: GatewayInput = {}, options: GatewayRequestOptions = {}): Promise<unknown> {
    return this.call('phoneLookup', input, options);
  }

  phoneValidate(input: GatewayInput = {}, options: GatewayRequestOptions = {}): Promise<unknown> {
    return this.call('phoneValidate', input, options);
  }

  weather(input: GatewayInput = {}, options: GatewayRequestOptions = {}): Promise<unknown> {
    return this.call('weather', input, options);
  }

  whoisLookup(input: GatewayInput = {}, options: GatewayRequestOptions = {}): Promise<unknown> {
    return this.call('whoisLookup', input, options);
  }

  aiSummarize(input: GatewayInput = {}, options: GatewayRequestOptions = {}): Promise<unknown> {
    return this.call('aiSummarize', input, options);
  }

  browserMarkdown(input: GatewayInput = {}, options: GatewayRequestOptions = {}): Promise<unknown> {
    return this.call('browserMarkdown', input, options);
  }

  browserPdf(input: GatewayInput = {}, options: GatewayRequestOptions = {}): Promise<unknown> {
    return this.call('browserPdf', input, options);
  }

  browserScreenshot(input: GatewayInput = {}, options: GatewayRequestOptions = {}): Promise<unknown> {
    return this.call('browserScreenshot', input, options);
  }

  computeBase64(input: GatewayInput = {}, options: GatewayRequestOptions = {}): Promise<unknown> {
    return this.call('computeBase64', input, options);
  }

  computeColor(input: GatewayInput = {}, options: GatewayRequestOptions = {}): Promise<unknown> {
    return this.call('computeColor', input, options);
  }

  computeCsv(input: GatewayInput = {}, options: GatewayRequestOptions = {}): Promise<unknown> {
    return this.call('computeCsv', input, options);
  }

  computeHash(input: GatewayInput = {}, options: GatewayRequestOptions = {}): Promise<unknown> {
    return this.call('computeHash', input, options);
  }

  computeHmac(input: GatewayInput = {}, options: GatewayRequestOptions = {}): Promise<unknown> {
    return this.call('computeHmac', input, options);
  }

  computeHtml(input: GatewayInput = {}, options: GatewayRequestOptions = {}): Promise<unknown> {
    return this.call('computeHtml', input, options);
  }

  computeJson(input: GatewayInput = {}, options: GatewayRequestOptions = {}): Promise<unknown> {
    return this.call('computeJson', input, options);
  }

  computeJsonSchema(input: GatewayInput = {}, options: GatewayRequestOptions = {}): Promise<unknown> {
    return this.call('computeJsonSchema', input, options);
  }

  computeJwtDecode(input: GatewayInput = {}, options: GatewayRequestOptions = {}): Promise<unknown> {
    return this.call('computeJwtDecode', input, options);
  }

  computeQr(input: GatewayInput = {}, options: GatewayRequestOptions = {}): Promise<unknown> {
    return this.call('computeQr', input, options);
  }

  computeSlug(input: GatewayInput = {}, options: GatewayRequestOptions = {}): Promise<unknown> {
    return this.call('computeSlug', input, options);
  }

  computeTextStats(input: GatewayInput = {}, options: GatewayRequestOptions = {}): Promise<unknown> {
    return this.call('computeTextStats', input, options);
  }

  computeUnits(input: GatewayInput = {}, options: GatewayRequestOptions = {}): Promise<unknown> {
    return this.call('computeUnits', input, options);
  }

  computeUrl(input: GatewayInput = {}, options: GatewayRequestOptions = {}): Promise<unknown> {
    return this.call('computeUrl', input, options);
  }

  emailValidate(input: GatewayInput = {}, options: GatewayRequestOptions = {}): Promise<unknown> {
    return this.call('emailValidate', input, options);
  }

  screenshot(input: GatewayInput = {}, options: GatewayRequestOptions = {}): Promise<unknown> {
    return this.call('screenshot', input, options);
  }

  securityPasswordExposure(input: GatewayInput = {}, options: GatewayRequestOptions = {}): Promise<unknown> {
    return this.call('securityPasswordExposure', input, options);
  }
}
