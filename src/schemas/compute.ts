import { z } from 'zod';
import { SUPPORTED_UNITS } from '../providers/compute/units.js';

export const base64Schema = z.object({
  input: z.string().max(1_000_000),
  operation: z.enum(['encode', 'decode']),
});

export const hashSchema = z.object({
  input: z.string().max(1_000_000),
  algorithm: z.enum(['md5', 'sha1', 'sha256', 'sha512']),
});

export const hmacSchema = z.object({
  message: z.string().max(1_000_000),
  secret: z.string().max(10_000),
  algorithm: z.enum(['sha256', 'sha512']).optional().default('sha256'),
});

export const uuidQuerySchema = z.object({
  version: z.enum(['v4', 'v7']).optional().default('v4'),
  count: z.coerce.number().int().min(1).max(1000).optional().default(1),
});

export const passwordQuerySchema = z.object({
  length: z.coerce.number().int().min(8).max(256).optional().default(24),
  symbols: z
    .union([z.string(), z.boolean()])
    .transform((v) => (v === 'false' ? false : Boolean(v)))
    .optional()
    .default(true),
});

export const jwtSchema = z.object({
  token: z.string().min(1).max(100_000),
});

export const jsonSchema = z.object({
  input: z.string().max(1_000_000),
  operation: z.enum(['format', 'minify', 'validate']),
});

export const uaQuerySchema = z.object({
  ua: z.string().min(1).max(10_000),
});

export const urlSchema = z.object({
  input: z.string().max(1_000_000),
  operation: z.enum(['encode', 'decode']),
});

export const htmlSchema = z.object({
  input: z.string().max(1_000_000),
  operation: z.enum(['encode', 'decode']),
});

export const dummyQuerySchema = z.object({
  type: z.enum(['paragraphs', 'words', 'user', 'address']).optional().default('paragraphs'),
  count: z.coerce.number().int().min(1).max(100).optional().default(1),
});

export const slugSchema = z.object({
  input: z.string().min(1).max(100_000),
  separator: z.enum(['-', '_']).optional().default('-'),
  lowercase: z.boolean().optional().default(true),
});

export const unitsSchema = z.object({
  value: z.number().finite(),
  from: z.enum(SUPPORTED_UNITS),
  to: z.enum(SUPPORTED_UNITS),
});

export const timeQuerySchema = z.object({
  at: z.string().datetime({ offset: true }).optional(),
  timezone: z.string().min(1).max(100).optional().default('UTC'),
});

export const qrSchema = z.object({
  data: z.string().min(1).max(4_096),
  error_correction: z.enum(['L', 'M', 'Q', 'H']).optional().default('M'),
  size: z.number().int().min(64).max(1_024).optional().default(256),
});

export const jsonSchemaValidationSchema = z.object({
  schema: z.unknown(),
  value: z.unknown(),
});

const delimiter = z.enum([',', ';', '\t']).optional().default(',');
const csvScalar = z.union([z.string(), z.number().finite(), z.boolean(), z.null()]);
export const csvSchema = z.discriminatedUnion('operation', [
  z.object({
    operation: z.literal('csv_to_json'),
    csv: z.string(),
    delimiter,
    headers: z.boolean().optional().default(true),
  }),
  z.object({
    operation: z.literal('json_to_csv'),
    rows: z.array(z.record(csvScalar)).max(10_000),
    delimiter,
  }),
]);

export const colorSchema = z.object({
  color: z.string().regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/),
  background: z.string().regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/).optional(),
});

export const textStatsSchema = z.object({
  text: z.string().refine((value) => Buffer.byteLength(value, 'utf8') <= 1_048_576, 'text exceeds 1 MiB'),
  words_per_minute: z.number().int().min(60).max(1_000).optional().default(200),
});

export const passwordExposureSchema = z.object({
  sha1: z.string().regex(/^[0-9a-fA-F]{40}$/).transform((value) => value.toUpperCase()),
});
