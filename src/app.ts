import Fastify, { LogController, type FastifyInstance } from 'fastify';
import { bearerAuth } from './auth/bearer.js';
import { config } from './config.js';
import { registerCors } from './cors.js';
import { makeError } from './lib/errors.js';
import { accessLogging, annotateAccess } from './observability/access.js';
import { policyRoutes } from './policy/routes.js';
import type { Provider } from './providers/_registry.js';
import { rateLimit } from './ratelimit/slidingWindow.js';
import { responsePolicy } from './responsePolicy.js';
import { computeRoutes } from './routes/compute/index.js';
import { dnsRoutes } from './routes/dns/resolve.js';
import { healthRoute } from './routes/health.js';
import { paidRoutes, type PaidRouteDependencies } from './routes/paid/index.js';
import { createPaidRouteDependencies } from './routes/paid/runtime.js';
import { passwordExposureRoute } from './routes/security/passwordExposure.js';
import { weatherRoutes } from './routes/weather/us.js';
import { whoisRoutes } from './routes/whois/lookup.js';

export interface AppOptions {
  paidDependencies?: PaidRouteDependencies;
  passwordExposureProvider?: Provider<{ sha1: string }, { exposed: boolean; count: number }>;
}

export async function buildApp(options: AppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false,
    genReqId: () => crypto.randomUUID(),
    logController: new LogController({ disableRequestLogging: true }),
  });

  await registerCors(app, config.corsOrigins);
  await accessLogging(app);
  await responsePolicy(app);
  await rateLimit(app);
  await bearerAuth(app);

  await app.register(healthRoute);
  await app.register(policyRoutes);
  await app.register(computeRoutes);
  await app.register(dnsRoutes);
  await app.register(weatherRoutes);
  await app.register(whoisRoutes);
  await app.register(passwordExposureRoute, { provider: options.passwordExposureProvider });
  await app.register(paidRoutes, options.paidDependencies ?? createPaidRouteDependencies());

  app.setErrorHandler((err: Error & { statusCode?: number }, req, reply) => {
    const status = err.statusCode && err.statusCode >= 400 && err.statusCode < 600 ? err.statusCode : 500;
    const code = status === 400 ? 'bad_request'
      : status === 404 ? 'not_found'
      : status === 429 ? 'rate_limited'
      : 'internal_error';
    const message = status >= 500 ? 'unexpected internal failure' : err.message;
    annotateAccess(req, { error_code: code });
    reply.code(status).send(makeError(code, message, req.id));
  });
  app.setNotFoundHandler((req, reply) => {
    reply.code(404).send(makeError('not_found', `no route for ${req.method} ${req.url}`, req.id));
  });

  await app.ready();
  return app;
}
