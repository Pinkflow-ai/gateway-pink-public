import type { FastifyInstance } from 'fastify';
import { runProvider } from '../../lib/handler.js';
import { parse } from '../../lib/parse.js';
import type { Provider } from '../../providers/_registry.js';
import { passwordExposureProvider } from '../../providers/security/hibp.js';
import { passwordExposureSchema } from '../../schemas/compute.js';

interface PasswordExposureRouteOptions {
  provider?: Provider<{ sha1: string }, { exposed: boolean; count: number }>;
}

export async function passwordExposureRoute(
  app: FastifyInstance,
  options: PasswordExposureRouteOptions = {},
): Promise<void> {
  const provider = options.provider ?? passwordExposureProvider;
  app.post('/v1/security/password-exposure', async (req, reply) => {
    const body = parse(passwordExposureSchema, req.body, req, reply);
    if (body) await runProvider(req, reply, 'POST /v1/security/password-exposure', provider, body);
  });
}
