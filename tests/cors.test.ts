import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { registerCors } from '../src/cors.js';

describe('browser CORS contract', () => {
  it('allows the public site to preflight authenticated JSON calls', async () => {
    const app = Fastify();
    await registerCors(app, ['http://127.0.0.1:4321']);
    app.post('/v1/test', async () => ({ ok: true }));

    const response = await app.inject({
      method: 'OPTIONS',
      url: '/v1/test',
      headers: {
        origin: 'http://127.0.0.1:4321',
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'authorization,content-type',
      },
    });

    expect(response.statusCode).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe('http://127.0.0.1:4321');
    expect(response.headers['access-control-allow-headers']).toContain('authorization');
    expect(response.headers['access-control-allow-headers']).toContain('content-type');
  });

  it('does not grant CORS access to an unapproved origin', async () => {
    const app = Fastify();
    await registerCors(app, ['https://gateway.pink']);
    app.get('/v1/test', async () => ({ ok: true }));

    const response = await app.inject({
      method: 'GET',
      url: '/v1/test',
      headers: { origin: 'https://attacker.example' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });
});
