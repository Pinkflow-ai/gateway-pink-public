import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Logger } from 'pino';
import { logger as defaultLogger } from '../log.js';

export interface AccessTelemetry {
  provider?: string;
  billing_outcome?: string;
  error_code?: string;
  credits?: number;
  input_tokens?: number;
  output_tokens?: number;
  browser_ms?: number;
}

interface RequestState {
  startedAt: number;
  telemetry: AccessTelemetry;
}

const states = new WeakMap<FastifyRequest, RequestState>();

export function annotateAccess(req: FastifyRequest, telemetry: AccessTelemetry): void {
  const state = states.get(req);
  if (state) Object.assign(state.telemetry, telemetry);
}

export async function accessLogging(app: FastifyInstance, target: Logger = defaultLogger): Promise<void> {
  app.addHook('onRequest', async (req) => {
    states.set(req, { startedAt: Date.now(), telemetry: {} });
  });
  app.addHook('onResponse', async (req, reply) => {
    const state = states.get(req) ?? { startedAt: Date.now(), telemetry: {} };
    const template = req.routeOptions?.url;
    const endpoint = template ? `${req.method} ${template}` : `${req.method} <unmatched>`;
    const event = {
      event: 'access',
      request_id: req.id,
      endpoint,
      status: reply.statusCode,
      latency_ms: Math.max(0, Date.now() - state.startedAt),
      ...state.telemetry,
    };
    if (reply.statusCode >= 500) target.error(event);
    else if (reply.statusCode >= 400) target.warn(event);
    else target.info(event);
    states.delete(req);
  });
}
