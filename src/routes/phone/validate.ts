import type { FastifyInstance } from 'fastify';
import { runProvider } from '../../lib/handler.js';
import { parse } from '../../lib/parse.js';
import {
  phoneValidationProvider,
  type PhoneValidationInput,
  type PhoneValidationOutput,
} from '../../providers/phone/validate.js';
import type { Provider } from '../../providers/_registry.js';
import { phoneValidationQuerySchema } from '../../schemas/data.js';

export async function phoneValidationRoutes(
  app: FastifyInstance,
  options: { provider?: Provider<PhoneValidationInput, PhoneValidationOutput> } = {},
): Promise<void> {
  app.get('/v1/phone/validate', async (request, reply) => {
    const query = parse(phoneValidationQuerySchema, request.query, request, reply);
    if (query) await runProvider(
      request,
      reply,
      'GET /v1/phone/validate',
      options.provider ?? phoneValidationProvider,
      query,
    );
  });
}
