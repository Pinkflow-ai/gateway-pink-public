import Fastify, { LogController } from 'fastify';
import { config } from './config.js';
import { logger } from './log.js';
import { bearerAuth } from './auth/bearer.js';
import { rateLimit } from './ratelimit/slidingWindow.js';
import { makeError } from './lib/errors.js';
import { healthRoute } from './routes/health.js';
import { policyRoutes } from './policy/routes.js';
import { computeRoutes } from './routes/compute/index.js';
import { dnsRoutes } from './routes/dns/resolve.js';
import { weatherRoutes } from './routes/weather/us.js';
import { whoisRoutes } from './routes/whois/lookup.js';
import { paidRoutes } from './routes/paid/index.js';
import { createPaidRouteDependencies } from './routes/paid/runtime.js';
import { registerCors } from './cors.js';

async function main(): Promise<void> {
  const app = Fastify({
    logger: false, // we use our own pino instance with the redaction hook.
    genReqId: () => crypto.randomUUID(),
    // We emit our own structured access logs via runProvider, so Fastify's
    // built-in request logging is disabled through its v5 log controller.
    logController: new LogController({ disableRequestLogging: true }),
  });

  // Plugins — order matters: CORS owns preflight before rate-limit/auth hooks.
  await registerCors(app, config.corsOrigins);
  // These hooks are applied directly to the root instance. Registering them as
  // sibling plugins would encapsulate the hooks away from the route plugins.
  await rateLimit(app);
  await bearerAuth(app);

  // Routes
  await app.register(healthRoute);
  await app.register(policyRoutes);
  await app.register(computeRoutes);
  await app.register(dnsRoutes);
  await app.register(weatherRoutes);
  await app.register(whoisRoutes);
  await app.register(paidRoutes, createPaidRouteDependencies());

  // One error envelope for every failure path.
  app.setErrorHandler((err: Error & { statusCode?: number }, req, reply) => {
    const status =
      err.statusCode && err.statusCode >= 400 && err.statusCode < 600 ? err.statusCode : 500;
    const code =
      status === 400 ? 'bad_request'
      : status === 404 ? 'not_found'
      : status === 429 ? 'rate_limited'
      : 'internal_error';
    const message = status >= 500 ? 'unexpected internal failure' : err.message;
    reply.code(status).send(makeError(code, message, req.id));
  });

  app.setNotFoundHandler((req, reply) => {
    reply.code(404).send(makeError('not_found', `no route for ${req.method} ${req.url}`, req.id));
  });

  try {
    await app.listen({ port: config.port, host: '0.0.0.0' });
    logger.info({ msg: 'gateway up', port: config.port, auth: config.devKeys.length > 0 ? 'on' : 'open' });
  } catch (err) {
    logger.fatal({ msg: 'failed to start', err: err instanceof Error ? err.message : String(err) });
    process.exit(1);
  }
}

main();
