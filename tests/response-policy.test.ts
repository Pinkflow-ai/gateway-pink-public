import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { responsePolicy } from '../src/responsePolicy.js';

describe('response policy', () => {
  it('sets real no-store headers for a none route', async () => {
    const app = Fastify();
    await responsePolicy(app);
    app.post('/v1/compute/hash', async () => ({ ok: true }));
    const response = await app.inject({ method: 'POST', url: '/v1/compute/hash' });
    expect(response.headers['cache-control']).toBe('no-store, private');
    expect(response.headers['x-gateway-no-store']).toBe('true');
    expect(response.headers['x-gateway-storage-policy']).toBe('none');
    expect(response.headers['x-request-id']).toBeTruthy();
  });

  it('sets no-store on early auth-style exits', async () => {
    const app = Fastify();
    await responsePolicy(app);
    app.addHook('onRequest', async (_req, reply) => {
      reply.code(401).send({ error: { code: 'unauthorized' } });
    });
    app.post('/v1/email/validate', async () => ({ ok: true }));
    const response = await app.inject({ method: 'POST', url: '/v1/email/validate' });
    expect(response.statusCode).toBe(401);
    expect(response.headers['cache-control']).toBe('no-store, private');
    expect(response.headers['x-gateway-storage-policy']).toBe('metadata-only');
  });
});
