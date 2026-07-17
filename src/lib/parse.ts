import type { FastifyReply, FastifyRequest } from 'fastify';
import type { ZodTypeAny, infer as zodInfer } from 'zod';
import { makeError } from './errors.js';

/**
 * Parse a request body or query against a zod schema. On failure, sends the
 * 400 and returns null — the caller bails. Keeps route handlers one-screen.
 */
export function parse<T extends ZodTypeAny>(
  schema: T,
  value: unknown,
  req: FastifyRequest,
  reply: FastifyReply,
): zodInfer<T> | null {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  reply
    .code(400)
    .send(makeError('bad_request', 'invalid request', req.id, result.error.flatten().fieldErrors));
  return null;
}
