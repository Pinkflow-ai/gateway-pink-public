import { z } from 'zod';

/** Parse a comma-separated env var into a string[]. Empty/missing → []. */
const commaList = z
  .preprocess((v) => (v == null ? '' : v), z.string())
  .transform((s) => s.split(',').map((t) => t.trim()).filter(Boolean));

const schema = z.object({
  port: z.coerce.number().int().positive().default(3000),
  devKeys: commaList,
  logLevel: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  rateLimitPerMinute: z.coerce.number().int().positive().default(120),
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
  cloudflareAccountId: z.string().default(''),
  cloudflareApiToken: z.string().default(''),
});

export type Config = z.infer<typeof schema>;

type ConfigEnvironment = Record<string, string | undefined>;

export function parseConfig(environment: ConfigEnvironment): Config {
  const parsed = schema.safeParse({
    port: environment.PORT,
    devKeys: environment.GATEWAY_DEV_KEYS,
    logLevel: environment.LOG_LEVEL,
    rateLimitPerMinute: environment.RATE_LIMIT_PER_MINUTE,
    upstreamTimeoutMs: environment.UPSTREAM_TIMEOUT_MS,
    upstreamUserAgent: environment.UPSTREAM_USER_AGENT,
    corsOrigins: environment.CORS_ORIGINS
      ?? 'https://gateway.pink,http://localhost:4321,http://127.0.0.1:4321',
    billingMode: environment.BILLING_MODE,
    devCreditBalance: environment.DEV_CREDIT_BALANCE,
    pricingManifestPath: environment.PRICING_MANIFEST_PATH,
    abstractEmailApiKey: environment.ABSTRACT_EMAIL_API_KEY,
    twilioAccountSid: environment.TWILIO_ACCOUNT_SID,
    twilioAuthToken: environment.TWILIO_AUTH_TOKEN,
    screenshotOneAccessKey: environment.SCREENSHOTONE_ACCESS_KEY,
    openRouterApiKey: environment.OPENROUTER_API_KEY,
    cloudflareAccountId: environment.CLOUDFLARE_ACCOUNT_ID,
    cloudflareApiToken: environment.CLOUDFLARE_API_TOKEN,
  });
  if (!parsed.success) {
    throw new Error(`invalid config: ${JSON.stringify(parsed.error.flatten().fieldErrors)}`);
  }
  if (parsed.data.billingMode !== 'off' && parsed.data.devKeys.length === 0) {
    throw new Error('paid billing requires at least one gateway dev key');
  }
  return parsed.data;
}

function load(): Config {
  try {
    return parseConfig(process.env);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Invalid config:', error instanceof Error ? error.message : String(error));
    if (process.env.VITEST === 'true') throw error;
    process.exit(1);
  }
}

export const config = load();
