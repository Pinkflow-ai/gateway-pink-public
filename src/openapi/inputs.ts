export interface InputSchema extends Record<string, unknown> {
  type: 'object';
  properties: Record<string, Record<string, unknown>>;
  required?: string[];
  additionalProperties: boolean;
}

const object = (
  properties: InputSchema['properties'],
  required: string[] = [],
): InputSchema => ({
  type: 'object', properties, ...(required.length ? { required } : {}), additionalProperties: false,
});
const string = (extra: Record<string, unknown> = {}) => ({ type: 'string', ...extra });
const number = (extra: Record<string, unknown> = {}) => ({ type: 'number', ...extra });
const integer = (extra: Record<string, unknown> = {}) => ({ type: 'integer', ...extra });
const boolean = () => ({ type: 'boolean' });

export const INPUT_SCHEMAS: Record<string, InputSchema> = {
  'GET /v1/compute/dummy': object({ type: string({ enum: ['paragraphs', 'words', 'user', 'address'], default: 'paragraphs' }), count: integer({ minimum: 1, maximum: 100, default: 1 }) }),
  'GET /v1/compute/password': object({ length: integer({ minimum: 8, maximum: 256, default: 24 }), symbols: boolean() }),
  'GET /v1/compute/time': object({ at: string({ format: 'date-time' }), timezone: string({ maxLength: 100, default: 'UTC' }) }),
  'GET /v1/compute/ua': object({ ua: string({ minLength: 1, maxLength: 10_000 }) }, ['ua']),
  'GET /v1/compute/uuid': object({ version: string({ enum: ['v4', 'v7'], default: 'v4' }), count: integer({ minimum: 1, maximum: 1_000, default: 1 }) }),
  'GET /v1/dns/resolve': object({ name: string({ minLength: 1, maxLength: 253 }), type: string({ enum: ['A', 'AAAA', 'MX', 'TXT', 'NS', 'CNAME'], default: 'A' }) }, ['name']),
  'GET /v1/phone/lookup': object({ number: string({ pattern: '^\\+[1-9]\\d{6,14}$' }) }, ['number']),
  'GET /v1/weather': object({ lat: number({ minimum: -90, maximum: 90 }), lon: number({ minimum: -180, maximum: 180 }) }, ['lat', 'lon']),
  'GET /v1/whois/lookup': object({ domain: string({ minLength: 1, maxLength: 253 }) }, ['domain']),

  'POST /v1/compute/base64': object({ input: string({ maxLength: 1_000_000 }), operation: string({ enum: ['encode', 'decode'] }) }, ['input', 'operation']),
  'POST /v1/compute/color': object({ color: string({ pattern: '^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$' }), background: string({ pattern: '^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$' }) }, ['color']),
  'POST /v1/compute/csv': object({ operation: string({ enum: ['csv_to_json', 'json_to_csv'] }), csv: string(), rows: { type: 'array', maxItems: 10_000, items: { type: 'object', additionalProperties: true } }, delimiter: string({ enum: [',', ';', '\t'], default: ',' }), headers: boolean() }, ['operation']),
  'POST /v1/compute/hash': object({ input: string({ maxLength: 1_000_000 }), algorithm: string({ enum: ['md5', 'sha1', 'sha256', 'sha512'] }) }, ['input', 'algorithm']),
  'POST /v1/compute/hmac': object({ message: string({ maxLength: 1_000_000 }), secret: string({ maxLength: 10_000 }), algorithm: string({ enum: ['sha256', 'sha512'], default: 'sha256' }) }, ['message', 'secret']),
  'POST /v1/compute/html': object({ input: string({ maxLength: 1_000_000 }), operation: string({ enum: ['encode', 'decode'] }) }, ['input', 'operation']),
  'POST /v1/compute/json': object({ input: string({ maxLength: 1_000_000 }), operation: string({ enum: ['format', 'minify', 'validate'] }) }, ['input', 'operation']),
  'POST /v1/compute/json-schema': object({ schema: {}, value: {} }, ['schema', 'value']),
  'POST /v1/compute/jwt/decode': object({ token: string({ minLength: 1, maxLength: 100_000 }) }, ['token']),
  'POST /v1/compute/qr': object({ data: string({ minLength: 1, maxLength: 4_096 }), error_correction: string({ enum: ['L', 'M', 'Q', 'H'], default: 'M' }), size: integer({ minimum: 64, maximum: 1_024, default: 256 }) }, ['data']),
  'POST /v1/compute/slug': object({ input: string({ minLength: 1, maxLength: 100_000 }), separator: string({ enum: ['-', '_'], default: '-' }), lowercase: boolean() }, ['input']),
  'POST /v1/compute/text-stats': object({ text: string({ minLength: 1, maxLength: 1_048_576 }), words_per_minute: integer({ minimum: 60, maximum: 1_000, default: 200 }) }, ['text']),
  'POST /v1/compute/units': object({ value: number(), from: string(), to: string() }, ['value', 'from', 'to']),
  'POST /v1/compute/url': object({ input: string({ maxLength: 1_000_000 }), operation: string({ enum: ['encode', 'decode'] }) }, ['input', 'operation']),
  'POST /v1/security/password-exposure': object({ sha1: string({ pattern: '^[0-9a-fA-F]{40}$' }) }, ['sha1']),

  'POST /v1/email/validate': object({ email: string({ format: 'email', maxLength: 320 }) }, ['email']),
  'POST /v1/screenshot': object({ url: string({ format: 'uri', maxLength: 2_048 }), format: string({ enum: ['png', 'jpeg', 'webp'], default: 'png' }), full_page: boolean(), viewport_width: integer({ minimum: 320, maximum: 3_840, default: 1_280 }), viewport_height: integer({ minimum: 200, maximum: 2_160, default: 720 }) }, ['url']),
  'POST /v1/ai/summarize': object({ text: string({ minLength: 1, maxLength: 50_000 }), style: string({ enum: ['concise', 'bullets', 'detailed'], default: 'concise' }), max_output_tokens: integer({ minimum: 32, maximum: 1_024, default: 1_024 }), max_credits: integer({ minimum: 1, maximum: 100, default: 100 }) }, ['text']),
  'POST /v1/browser/screenshot': object({ url: string({ format: 'uri', maxLength: 2_048 }), format: string({ enum: ['png', 'jpeg'], default: 'png' }), full_page: boolean(), viewport_width: integer({ minimum: 320, maximum: 1_920, default: 1_280 }), viewport_height: integer({ minimum: 200, maximum: 1_080, default: 720 }) }, ['url']),
  'POST /v1/browser/pdf': object({ url: string({ format: 'uri', maxLength: 2_048 }) }, ['url']),
  'POST /v1/browser/markdown': object({ url: string({ format: 'uri', maxLength: 2_048 }) }, ['url']),
};
