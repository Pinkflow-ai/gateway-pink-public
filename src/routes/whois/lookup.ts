import type { FastifyInstance } from 'fastify';
import { runProvider } from '../../lib/handler.js';
import { parse } from '../../lib/parse.js';
import { whoisQuerySchema } from '../../schemas/data.js';
import { rdapProvider } from '../../providers/whois/rdap.js';

/** GET /v1/whois/lookup — RDAP (RFC 7483). Free public standard. */
export async function whoisRoutes(app: FastifyInstance): Promise<void> {
  app.get('/v1/whois/lookup', async (req, reply) => {
    const q = parse(whoisQuerySchema, req.query, req, reply);
    if (q) await runProvider(req, reply, 'GET /v1/whois/lookup', rdapProvider, q);
  });
}
