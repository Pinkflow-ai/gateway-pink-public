import { randomUUID } from 'node:crypto';

/**
 * Per-request id. UUIDv7 (time-orderable) where the runtime supports it,
 * falling back to v4. Surfaced in logs and the response header so a user can
 * cross-reference a support ticket.
 */
export function newRequestId(): string {
  return randomUUID();
}
