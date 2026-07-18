import { Writable } from 'node:stream';
import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { accessLogging } from '../src/observability/access.js';
import { createGatewayLogger } from '../src/log.js';

function capture() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      lines.push(chunk.toString());
      callback();
    },
  });
  return { lines, logger: createGatewayLogger(stream) };
}

describe('central access logging', () => {
  it('emits exactly one payload-free event for each terminal response', async () => {
    const { lines, logger } = capture();
    const app = Fastify();
    await accessLogging(app, logger);
    app.get('/v1/example', async () => ({ ok: true }));
    app.post('/v1/reject', async (_req, reply) => reply.code(400).send({ error: 'no' }));

    await app.inject({ method: 'GET', url: '/v1/example?secret=never-log' });
    await app.inject({ method: 'POST', url: '/v1/reject', payload: { email: 'private@example.com' } });

    const events = lines.flatMap((line) => line.trim().split('\n')).filter(Boolean).map((line) => JSON.parse(line));
    expect(events).toHaveLength(2);
    expect(events.map((event) => event.endpoint)).toEqual(['GET /v1/example', 'POST /v1/reject']);
    expect(events.map((event) => event.status)).toEqual([200, 400]);
    expect(lines.join('')).not.toContain('never-log');
    expect(lines.join('')).not.toContain('private@example.com');
  });

  it('redacts body, query, params, url, and canonical payload fields defensively', () => {
    const { lines, logger } = capture();
    logger.info({
      req: {
        url: '/v1/test?token=query-secret',
        query: { email: 'query@example.com' },
        params: { domain: 'private.example' },
        body: { input: 'body-secret' },
      },
      message: 'message-secret',
      output: 'output-secret',
    });
    const serialized = lines.join('');
    for (const secret of ['query-secret', 'query@example.com', 'private.example', 'body-secret', 'message-secret', 'output-secret']) {
      expect(serialized).not.toContain(secret);
    }
  });
});
