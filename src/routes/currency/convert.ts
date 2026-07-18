import type { FastifyInstance } from 'fastify';
import { runProvider } from '../../lib/handler.js';
import { parse } from '../../lib/parse.js';
import type { Provider } from '../../providers/_registry.js';
import {
  ecbFxProvider,
  type EcbFxInput,
  type EcbFxOutput,
} from '../../providers/currency/ecb.js';
import { currencyConvertQuerySchema } from '../../schemas/data.js';

export async function currencyRoutes(
  app: FastifyInstance,
  options: { provider?: Provider<EcbFxInput, EcbFxOutput> } = {},
): Promise<void> {
  app.get('/v1/currency/convert', async (request, reply) => {
    const query = parse(currencyConvertQuerySchema, request.query, request, reply);
    if (query) await runProvider(
      request,
      reply,
      'GET /v1/currency/convert',
      options.provider ?? ecbFxProvider,
      query,
    );
  });
}
