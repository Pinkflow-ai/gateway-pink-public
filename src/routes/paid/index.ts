import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { RuntimeBrowserTimePricing, RuntimeFlatPricing, RuntimeMeteredPricing } from '../../billing/pricing.js';
import { estimateMeteredCredits } from '../../billing/pricing.js';
import type { BillingIdentity, UsageMeter } from '../../billing/types.js';
import { makeError } from '../../lib/errors.js';
import { runBrowserPaidProvider, runFlatPaidProvider, runMeteredPaidProvider } from '../../lib/paidHandler.js';
import { parse } from '../../lib/parse.js';
import type { BrowserMeteredProvider, MeteredProvider, Provider } from '../../providers/_registry.js';
import { browserScreenshotSchema, browserUrlSchema, emailValidationSchema, phoneLookupQuerySchema, screenshotSchema, summarizeSchema } from '../../schemas/paid.js';

export interface PaidRouteDependencies {
  meter: UsageMeter;
  identityForRequest: (request: FastifyRequest) => BillingIdentity;
  prices: {
    email: RuntimeFlatPricing;
    phone: RuntimeFlatPricing;
    screenshot: RuntimeFlatPricing;
    summarize: RuntimeMeteredPricing;
    browserScreenshot: RuntimeBrowserTimePricing;
    browserPdf: RuntimeBrowserTimePricing;
    browserMarkdown: RuntimeBrowserTimePricing;
  };
  emailProvider: Provider<unknown, unknown>;
  phoneProvider: Provider<unknown, unknown>;
  screenshotProvider: Provider<unknown, unknown>;
  summarizeProvider: MeteredProvider<unknown, unknown>;
  browserScreenshotProvider: BrowserMeteredProvider<unknown, unknown>;
  browserPdfProvider: BrowserMeteredProvider<unknown, unknown>;
  browserMarkdownProvider: BrowserMeteredProvider<unknown, unknown>;
}

export async function paidRoutes(app: FastifyInstance, deps: PaidRouteDependencies): Promise<void> {
  app.post('/v1/email/validate', async (req, reply) => {
    const body = parse(emailValidationSchema, req.body, req, reply);
    if (body) await runFlatPaidProvider({ req, reply, route: 'POST /v1/email/validate', provider: deps.emailProvider,
      input: body, pricing: deps.prices.email, meter: deps.meter, identityForRequest: deps.identityForRequest });
  });
  app.get('/v1/phone/lookup', async (req, reply) => {
    const query = parse(phoneLookupQuerySchema, req.query, req, reply);
    if (query) await runFlatPaidProvider({ req, reply, route: 'GET /v1/phone/lookup', provider: deps.phoneProvider,
      input: query, pricing: deps.prices.phone, meter: deps.meter, identityForRequest: deps.identityForRequest });
  });
  app.post('/v1/screenshot', async (req, reply) => {
    const body = parse(screenshotSchema, req.body, req, reply);
    if (body) await runFlatPaidProvider({ req, reply, route: 'POST /v1/screenshot', provider: deps.screenshotProvider,
      input: { url: body.url, format: body.format, fullPage: body.full_page,
        viewportWidth: body.viewport_width, viewportHeight: body.viewport_height },
      pricing: deps.prices.screenshot, meter: deps.meter, identityForRequest: deps.identityForRequest });
  });
  app.post('/v1/ai/summarize', async (req, reply) => {
    const body = parse(summarizeSchema, req.body, req, reply);
    if (!body) return;
    const requiredCredits = estimateMeteredCredits(
      body.text,
      deps.prices.summarize,
      body.max_output_tokens,
    );
    if (body.max_credits < requiredCredits) {
      reply.code(400).send(makeError('budget_too_low',
        `max_credits must be at least ${requiredCredits} for this input and output cap`, req.id,
        { required_credits: requiredCredits }));
      return;
    }
    await runMeteredPaidProvider({ req, reply, route: 'POST /v1/ai/summarize', provider: deps.summarizeProvider,
      input: { text: body.text, style: body.style, maxOutputTokens: body.max_output_tokens },
      maxCredits: body.max_credits, pricing: deps.prices.summarize,
      meter: deps.meter, identityForRequest: deps.identityForRequest });
  });
  app.post('/v1/browser/screenshot', async (req, reply) => {
    const body = parse(browserScreenshotSchema, req.body, req, reply);
    if (body) await runBrowserPaidProvider({
      req, reply, route: 'POST /v1/browser/screenshot', provider: deps.browserScreenshotProvider,
      input: { url: body.url, format: body.format, fullPage: body.full_page,
        viewportWidth: body.viewport_width, viewportHeight: body.viewport_height },
      pricing: deps.prices.browserScreenshot, meter: deps.meter, identityForRequest: deps.identityForRequest,
    });
  });
  app.post('/v1/browser/pdf', async (req, reply) => {
    const body = parse(browserUrlSchema, req.body, req, reply);
    if (body) await runBrowserPaidProvider({
      req, reply, route: 'POST /v1/browser/pdf', provider: deps.browserPdfProvider,
      input: body, pricing: deps.prices.browserPdf, meter: deps.meter, identityForRequest: deps.identityForRequest,
    });
  });
  app.post('/v1/browser/markdown', async (req, reply) => {
    const body = parse(browserUrlSchema, req.body, req, reply);
    if (body) await runBrowserPaidProvider({
      req, reply, route: 'POST /v1/browser/markdown', provider: deps.browserMarkdownProvider,
      input: body, pricing: deps.prices.browserMarkdown, meter: deps.meter, identityForRequest: deps.identityForRequest,
    });
  });
}
