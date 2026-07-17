import type { FastifyInstance } from 'fastify';
import { runProvider } from '../../lib/handler.js';
import { parse } from '../../lib/parse.js';
import { weatherQuerySchema } from '../../schemas/data.js';
import { noaaProvider } from '../../providers/weather/noaa.js';

/**
 * GET /v1/weather — NOAA/NWS, US coverage only. Free, but rate-limited by
 * NOAA (~60 req/min); our own limiter keeps callers under that.
 */
export async function weatherRoutes(app: FastifyInstance): Promise<void> {
  app.get('/v1/weather', async (req, reply) => {
    const q = parse(weatherQuerySchema, req.query, req, reply);
    if (q) await runProvider(req, reply, 'GET /v1/weather', noaaProvider, q);
  });
}
