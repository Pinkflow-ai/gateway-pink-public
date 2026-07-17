import { z } from 'zod';

/** Parse a comma-separated env var into a string[]. Empty/missing → []. */
const commaList = z
  .preprocess((v) => (v == null ? '' : v), z.string())
  .transform((s) => s.split(',').map((t) => t.trim()).filter(Boolean));

const schema = z.object({
  port: z.coerce.number().int().positive().default(3000),
  devKeys: commaList,
  logLevel: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  rateLimitPerMinute: z.coerce.number().int().positive().default(60),
  upstreamTimeoutMs: z.coerce.number().int().positive().default(5000),
  upstreamUserAgent: z.string().default('Gateway.pink'),
  corsOrigins: commaList,
  billingMode: z.enum(['off', 'memory']).default('off'),
  devCreditBalance: z.coerce.number().int().nonnegative().default(0),
  pricingManifestPath: z.string().default('./config/pricing.manifest.json'),
  abstractEmailApiKey: z.string().default(''),
  twilioAccountSid: z.string().default(''),
  twilioAuthToken: z.string().default(''),
  screenshotOneAccessKey: z.string().default(''),
  openRouterApiKey: z.string().default(''),
});

export type Config = z.infer<typeof schema>;

function load(): Config {
  const parsed = schema.safeParse({
    port: process.env.PORT,
    devKeys: process.env.GATEWAY_DEV_KEYS,
    logLevel: process.env.LOG_LEVEL,
    rateLimitPerMinute: process.env.RATE_LIMIT_PER_MINUTE,
    upstreamTimeoutMs: process.env.UPSTREAM_TIMEOUT_MS,
    upstreamUserAgent: process.env.UPSTREAM_USER_AGENT,
    corsOrigins: process.env.CORS_ORIGINS
      ?? 'https://gateway.pink,http://localhost:4321,http://127.0.0.1:4321',
    billingMode: process.env.BILLING_MODE,
    devCreditBalance: process.env.DEV_CREDIT_BALANCE,
    pricingManifestPath: process.env.PRICING_MANIFEST_PATH,
    abstractEmailApiKey: process.env.ABSTRACT_EMAIL_API_KEY,
    twilioAccountSid: process.env.TWILIO_ACCOUNT_SID,
    twilioAuthToken: process.env.TWILIO_AUTH_TOKEN,
    screenshotOneAccessKey: process.env.SCREENSHOTONE_ACCESS_KEY,
    openRouterApiKey: process.env.OPENROUTER_API_KEY,
  });
  if (!parsed.success) {
    // eslint-disable-next-line no-console
    console.error('Invalid config:', parsed.error.flatten().fieldErrors);
    // In tests we don't want a bad env to kill the runner.
    if (process.env.VITEST === 'true') {
      throw new Error(`invalid config: ${JSON.stringify(parsed.error.flatten().fieldErrors)}`);
    }
    process.exit(1);
  }
  return parsed.data;
}

export const config = load();
