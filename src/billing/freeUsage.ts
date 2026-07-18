import type { FastifyInstance, FastifyRequest } from 'fastify';
import { config } from '../config.js';
import type { Queryable } from '../database/types.js';
import { logger } from '../log.js';
import { loadPricingManifest } from './manifest.js';

export interface FreeUsageEvent {
  orgId: string;
  apiKeyId: string;
  endpoint: string;
  requestId: string;
  httpStatus: number;
  success: boolean;
  durationMs: number;
}

export interface FreeUsageRecorder {
  record(event: FreeUsageEvent): Promise<void>;
}

export class PostgresFreeUsageRecorder implements FreeUsageRecorder {
  constructor(private readonly database: Queryable) {}

  async record(event: FreeUsageEvent): Promise<void> {
    await this.database.query(
      `select record_free_usage(
        $1::uuid, $2::uuid, $3::text, $4::text,
        $5::integer, $6::boolean, $7::integer
      )`,
      [
        event.orgId,
        event.apiKeyId,
        event.endpoint,
        event.requestId,
        event.httpStatus,
        event.success,
        event.durationMs,
      ],
    );
  }
}

export async function freeUsageRecording(
  app: FastifyInstance,
  recorder: FreeUsageRecorder,
): Promise<void> {
  const manifest = loadPricingManifest(config.pricingManifestPath);
  const freeRoutes = new Set(
    Object.entries(manifest.routes)
      .filter(([, pricing]) => pricing.kind === 'free')
      .map(([route]) => route),
  );
  const startedAt = new WeakMap<FastifyRequest, number>();

  app.addHook('onRequest', async (request) => {
    startedAt.set(request, Date.now());
  });
  app.addHook('onResponse', async (request, reply) => {
    const principal = request.gatewayPrincipal;
    const template = request.routeOptions?.url;
    if (!principal || !template) return;
    if ((request.routeOptions.config as { publicRoute?: boolean } | undefined)?.publicRoute) return;
    const endpoint = `${request.method} ${template}`;
    if (!freeRoutes.has(endpoint)) return;
    const event: FreeUsageEvent = {
      orgId: principal.orgId,
      apiKeyId: principal.apiKeyId,
      endpoint,
      requestId: request.id,
      httpStatus: reply.statusCode,
      success: reply.statusCode >= 200 && reply.statusCode < 400,
      durationMs: Math.max(0, Date.now() - (startedAt.get(request) ?? Date.now())),
    };
    try {
      await recorder.record(event);
    } catch (error) {
      logger.error({
        event: 'free_usage_record_failed',
        request_id: request.id,
        endpoint,
        error: error instanceof Error ? error.message : 'unknown database failure',
      });
    } finally {
      startedAt.delete(request);
    }
  });
}
