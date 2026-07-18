import { Ajv2020 } from 'ajv/dist/2020.js';
import type { ErrorObject } from 'ajv';
import { fail, ok, type Provider } from '../_registry.js';

function jsonBytes(value: unknown): number {
  try { return Buffer.byteLength(JSON.stringify(value), 'utf8'); }
  catch { return Number.POSITIVE_INFINITY; }
}

function depth(value: unknown, level = 0): number {
  if (level > 32) return level;
  if (!value || typeof value !== 'object') return level;
  const values = Array.isArray(value) ? value : Object.values(value as Record<string, unknown>);
  return values.reduce((maximum, child) => Math.max(maximum, depth(child, level + 1)), level);
}

function containsUnboundedRegex(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  if (!Array.isArray(value)) {
    const object = value as Record<string, unknown>;
    if ('pattern' in object || 'patternProperties' in object) return true;
  }
  return (Array.isArray(value) ? value : Object.values(value as Record<string, unknown>))
    .some(containsUnboundedRegex);
}

function publicError(error: ErrorObject) {
  return {
    instance_path: error.instancePath,
    schema_path: error.schemaPath,
    keyword: error.keyword,
    message: error.message ?? 'validation failed',
  };
}

export const jsonSchemaProvider: Provider<
  { schema: unknown; value: unknown },
  { valid: boolean; errors: ReturnType<typeof publicError>[] }
> = {
  id: 'compute.json-schema',
  storagePolicy: 'none',
  source: { name: 'Ajv JSON Schema validator', url: 'https://ajv.js.org/', license: 'MIT' },
  async execute({ schema, value }) {
    if (jsonBytes(schema) > 102_400) return fail('bad_input', 'schema exceeds 100 KiB');
    if (jsonBytes(value) > 512_000) return fail('bad_input', 'value exceeds 500 KiB');
    if (depth(schema) > 32 || depth(value) > 32) return fail('bad_input', 'JSON depth exceeds 32');
    if (containsUnboundedRegex(schema)) return fail('bad_input', 'pattern and patternProperties are not supported');
    try {
      const ajv = new Ajv2020({ allErrors: true, strict: false, validateFormats: false });
      const validate = ajv.compile(schema as object | boolean);
      const valid = validate(value) as boolean;
      return ok({ valid, errors: (validate.errors ?? []).slice(0, 100).map(publicError) });
    } catch {
      return fail('bad_input', 'schema is not a valid supported JSON Schema');
    }
  },
};
