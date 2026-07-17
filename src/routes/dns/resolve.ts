import type { FastifyInstance } from 'fastify';
import { runProvider } from '../../lib/handler.js';
import { parse } from '../../lib/parse.js';
import { dnsQuerySchema } from '../../schemas/data.js';
import { dnsProvider } from '../../providers/dns/resolve.js';

/** GET /v1/dns/resolve — direct DNS. Free, no upstream rate limit. */
export async function dnsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/v1/dns/resolve', async (req, reply) => {
    const q = parse(dnsQuerySchema, req.query, req, reply);
    if (q) await runProvider(req, reply, 'GET /v1/dns/resolve', dnsProvider, q);
  });
}
