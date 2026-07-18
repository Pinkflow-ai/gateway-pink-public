import { config } from './config.js';
import { logger } from './log.js';
import { buildApp } from './app.js';
import { createRuntimeResources } from './runtime/resources.js';

async function main(): Promise<void> {
  const resources = await createRuntimeResources(config);
  const app = await buildApp({
    authenticator: resources.authenticator,
    paidDependencies: resources.paidDependencies,
    rateLimitOptions: resources.rateLimitOptions,
    readiness: resources.readiness,
    paidRoutesState: resources.paidRoutesState,
    closeResources: resources.close,
    freeUsageRecorder: resources.freeUsageRecorder,
  });

  try {
    await app.listen({ port: config.port, host: '0.0.0.0' });
    logger.info({
      msg: 'gateway up', port: config.port,
      auth: config.authMode === 'postgres' || config.devKeys.length > 0 ? 'on' : 'open',
      runtime: config.runtimeEnv,
    });
  } catch (err) {
    logger.fatal({ msg: 'failed to start', err: err instanceof Error ? err.message : String(err) });
    process.exit(1);
  }
}

main();
