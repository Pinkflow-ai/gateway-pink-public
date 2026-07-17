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
