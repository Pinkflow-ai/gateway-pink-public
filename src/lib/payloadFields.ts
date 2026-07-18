/**
 * Field names treated as "payload-like" by the logger's redaction policy and
 * by the guard test. Kept here (not in log.ts) so the guard test can import it
 * without pulling in the pino logger + config machinery.
 *
 * If a route handler with storagePolicy 'none' logs any of these, the guard
 * test fails. If the logger is ever handed one of these in an arbitrary
 * object, pino's redact config replaces the value with [redacted].
 */
export const PAYLOAD_LOG_FIELDS = new Set([
  'body',
  'rawBody',
  'payload',
  'input',
  'message',
  'secret',
  'password',
  'token',
  'email',
  'domain',
  'digest',
  'output',
]);
