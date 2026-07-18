import pino, { type DestinationStream, type LoggerOptions } from 'pino';
import { config } from './config.js';
import { PAYLOAD_LOG_FIELDS } from './lib/payloadFields.js';

/**
 * Redaction policy — the backbone of the no-payload commitment
 * (docs/catalog-and-pricing-strategy.md §6.2, architecture.md §8.4).
 *
 * Anything matching these paths is replaced with `[redacted]` before the log
 * line is serialized. So even a stray `log.debug(req)` cannot leak a body.
 */
const REDACT_PATHS = [
  'req.url',
  'req.query',
  'req.query.*',
  'req.params',
  'req.params.*',
  'req.body',
  'req.body.*',
  'res.body',
  'res.body.*',
  'req.headers.authorization',
  'req.headers["authorization"]',
  'req.headers.cookie',
  // Belt-and-braces: any field whose name smells like a payload or secret.
  '*.payload',
  '*.payload.*',
  '*.secret',
  '*.secret.*',
  '*.password',
  '*.password.*',
  '*.token',
  '*.token.*',
  '*.apiKey',
  '*.api_key',
  ...[...PAYLOAD_LOG_FIELDS].flatMap((field) => [field, `*.${field}`, `*.*.${field}`]),
];

/** Re-exported so the guard test and logger share one definition. */
export { PAYLOAD_LOG_FIELDS } from './lib/payloadFields.js';

const options: LoggerOptions = {
  level: config.logLevel,
  redact: {
    paths: REDACT_PATHS,
    censor: '[redacted]',
  },
  base: { service: 'gateway-pink' },
};

export function createGatewayLogger(destination?: DestinationStream) {
  return destination ? pino(options, destination) : pino(options);
}

export const logger = createGatewayLogger();

/** Child logger scoped to a request — carries request_id throughout. */
export function requestLogger(requestId: string) {
  return logger.child({ request_id: requestId });
}
