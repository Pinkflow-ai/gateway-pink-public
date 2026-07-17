/**
 * One error envelope across every route (architecture.md §8.2). Never leaky —
 * `details` is reserved for zod validation shapes, never raw upstream output.
 */
export interface ApiError {
  code: string;
  message: string;
  request_id: string;
  details?: unknown;
}

export interface ApiErrorEnvelope {
  error: ApiError;
}

/** HTTP status for each error code (architecture.md §8.2). */
export const ERROR_STATUS: Record<string, number> = {
  bad_request: 400,
  unauthorized: 401,
  insufficient_credits: 402,
  billing_conflict: 409,
  not_found: 404,
  rate_limited: 429,
  provider_unavailable: 503,
  upstream_error: 502,
  upstream_timeout: 504,
  internal_error: 500,
};

export function makeError(
  code: keyof typeof ERROR_STATUS | string,
  message: string,
  requestId: string,
  details?: unknown,
): ApiErrorEnvelope {
  return { error: { code, message, request_id: requestId, ...(details ? { details } : {}) } };
}

/** Maps an unknown thrown value to the envelope. Used as the last resort. */
export function toUnexpectedError(_err: unknown, requestId: string): ApiErrorEnvelope {
  return makeError('internal_error', 'unexpected internal failure', requestId);
}
