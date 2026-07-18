import { config } from './config.js';
import { logger } from './log.js';
import { buildApp } from './app.js';

async function main(): Promise<void> {
  const app = await buildApp();

  try {
    await app.listen({ port: config.port, host: '0.0.0.0' });
    logger.info({ msg: 'gateway up', port: config.port, auth: config.devKeys.length > 0 ? 'on' : 'open' });
  } catch (err) {
    logger.fatal({ msg: 'failed to start', err: err instanceof Error ? err.message : String(err) });
    process.exit(1);
  }
}

main();
