import type { FastifyInstance } from 'fastify';
import { runProvider } from '../../lib/handler.js';
import { parse } from '../../lib/parse.js';
import {
  base64Schema,
  hashSchema,
  hmacSchema,
  uuidQuerySchema,
  passwordQuerySchema,
  jwtSchema,
  jsonSchema,
  uaQuerySchema,
  urlSchema,
  htmlSchema,
  dummyQuerySchema,
  slugSchema,
  unitsSchema,
  timeQuerySchema,
  qrSchema,
  jsonSchemaValidationSchema,
  csvSchema,
  colorSchema,
  textStatsSchema,
} from '../../schemas/compute.js';
import { base64Provider } from '../../providers/compute/base64.js';
import { hashProvider } from '../../providers/compute/hash.js';
import { hmacProvider } from '../../providers/compute/hmac.js';
import { uuidProvider } from '../../providers/compute/uuid.js';
import { passwordProvider } from '../../providers/compute/password.js';
import { jwtDecodeProvider } from '../../providers/compute/jwt-decode.js';
import { jsonProvider } from '../../providers/compute/json.js';
import { uaParseProvider } from '../../providers/compute/ua-parse.js';
import { urlProvider } from '../../providers/compute/url.js';
import { htmlProvider } from '../../providers/compute/html.js';
import { dummyProvider } from '../../providers/compute/dummy.js';
import { slugProvider } from '../../providers/compute/slug.js';
import { unitsProvider } from '../../providers/compute/units.js';
import { timeProvider } from '../../providers/compute/time.js';
import { qrProvider } from '../../providers/compute/qr.js';
import { jsonSchemaProvider } from '../../providers/compute/json-schema.js';
import { csvProvider } from '../../providers/compute/csv.js';
import { colorProvider } from '../../providers/compute/color.js';
import { textStatsProvider } from '../../providers/compute/text-stats.js';

/** Compute-only routes. Every one sets X-Gateway-No-Store: true. */
export async function computeRoutes(app: FastifyInstance): Promise<void> {
  app.post('/v1/compute/base64', async (req, reply) => {
    const body = parse(base64Schema, req.body, req, reply);
    if (body) await runProvider(req, reply, 'POST /v1/compute/base64', base64Provider, body);
  });
  app.post('/v1/compute/hash', async (req, reply) => {
    const body = parse(hashSchema, req.body, req, reply);
    if (body) await runProvider(req, reply, 'POST /v1/compute/hash', hashProvider, body);
  });
  app.post('/v1/compute/hmac', async (req, reply) => {
    const body = parse(hmacSchema, req.body, req, reply);
    if (body) await runProvider(req, reply, 'POST /v1/compute/hmac', hmacProvider, body);
  });
  app.get('/v1/compute/uuid', async (req, reply) => {
    const q = parse(uuidQuerySchema, req.query, req, reply);
    if (q) await runProvider(req, reply, 'GET /v1/compute/uuid', uuidProvider, q);
  });
  app.get('/v1/compute/password', async (req, reply) => {
    const q = parse(passwordQuerySchema, req.query, req, reply);
    if (q) await runProvider(req, reply, 'GET /v1/compute/password', passwordProvider, q);
  });
  app.post('/v1/compute/jwt/decode', async (req, reply) => {
    const body = parse(jwtSchema, req.body, req, reply);
    if (body) await runProvider(req, reply, 'POST /v1/compute/jwt/decode', jwtDecodeProvider, body);
  });
  app.post('/v1/compute/json', async (req, reply) => {
    const body = parse(jsonSchema, req.body, req, reply);
    if (body) await runProvider(req, reply, 'POST /v1/compute/json', jsonProvider, body);
  });
  app.get('/v1/compute/ua', async (req, reply) => {
    const q = parse(uaQuerySchema, req.query, req, reply);
    if (q) await runProvider(req, reply, 'GET /v1/compute/ua', uaParseProvider, q);
  });
  app.post('/v1/compute/url', async (req, reply) => {
    const body = parse(urlSchema, req.body, req, reply);
    if (body) await runProvider(req, reply, 'POST /v1/compute/url', urlProvider, body);
  });
  app.post('/v1/compute/html', async (req, reply) => {
    const body = parse(htmlSchema, req.body, req, reply);
    if (body) await runProvider(req, reply, 'POST /v1/compute/html', htmlProvider, body);
  });
  app.get('/v1/compute/dummy', async (req, reply) => {
    const q = parse(dummyQuerySchema, req.query, req, reply);
    if (q) await runProvider(req, reply, 'GET /v1/compute/dummy', dummyProvider, q);
  });
  app.post('/v1/compute/slug', async (req, reply) => {
    const body = parse(slugSchema, req.body, req, reply);
    if (body) await runProvider(req, reply, 'POST /v1/compute/slug', slugProvider, body);
  });
  app.post('/v1/compute/units', async (req, reply) => {
    const body = parse(unitsSchema, req.body, req, reply);
    if (body) await runProvider(req, reply, 'POST /v1/compute/units', unitsProvider, body);
  });
  app.get('/v1/compute/time', async (req, reply) => {
    const q = parse(timeQuerySchema, req.query, req, reply);
    if (q) await runProvider(req, reply, 'GET /v1/compute/time', timeProvider, q);
  });
  app.post('/v1/compute/qr', async (req, reply) => {
    const body = parse(qrSchema, req.body, req, reply);
    if (body) await runProvider(req, reply, 'POST /v1/compute/qr', qrProvider, body);
  });
  app.post('/v1/compute/json-schema', async (req, reply) => {
    const body = parse(jsonSchemaValidationSchema, req.body, req, reply);
    if (body) await runProvider(req, reply, 'POST /v1/compute/json-schema', jsonSchemaProvider, body);
  });
  app.post('/v1/compute/csv', async (req, reply) => {
    const body = parse(csvSchema, req.body, req, reply);
    if (body) await runProvider(req, reply, 'POST /v1/compute/csv', csvProvider, body);
  });
  app.post('/v1/compute/color', async (req, reply) => {
    const body = parse(colorSchema, req.body, req, reply);
    if (body) await runProvider(req, reply, 'POST /v1/compute/color', colorProvider, body);
  });
  app.post('/v1/compute/text-stats', async (req, reply) => {
    const body = parse(textStatsSchema, req.body, req, reply);
    if (body) await runProvider(req, reply, 'POST /v1/compute/text-stats', textStatsProvider, body);
  });
}
