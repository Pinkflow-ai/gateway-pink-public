import { z } from 'zod';
import { fail, ok, type Provider } from '../_registry.js';
import { providerFetch, providerJson, type Fetcher } from '../http.js';

interface PhoneInput { number: string }
interface PhoneOutput {
  number: string;
  nationalFormat: string | null;
  countryCode: string | null;
  valid: boolean;
  lineType: string | null;
  carrier: string | null;
}
const twilioResponse = z.object({
  phone_number: z.string().min(1),
  national_format: z.string().min(1).nullable().optional(),
  country_code: z.string().min(1).nullable().optional(),
  valid: z.boolean(),
  line_type_intelligence: z.object({
    type: z.string().min(1).nullable().optional(),
    carrier_name: z.string().min(1).nullable().optional(),
    error_code: z.number().int().nullable().optional(),
  }).passthrough().nullable().optional(),
}).passthrough();

export function createPhoneLookupProvider(accountSid: string, authToken: string, fetcher: Fetcher = fetch): Provider<PhoneInput, PhoneOutput> {
  return {
    id: 'phone.twilio-line-type',
    storagePolicy: 'metadata-only',
    source: { name: 'Twilio Lookup v2', url: 'https://www.twilio.com/docs/lookup/v2-api', license: 'Commercial API' },
    async execute({ number }, ctx) {
      if (!accountSid || !authToken) return fail('provider_unavailable', 'phone lookup provider is not configured');
      const url = new URL(`https://lookups.twilio.com/v2/PhoneNumbers/${encodeURIComponent(number)}`);
      url.searchParams.set('Fields', 'line_type_intelligence');
      const response = await providerFetch(fetcher, url, {
        signal: AbortSignal.timeout(ctx.timeoutMs),
        headers: {
          authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
          'user-agent': ctx.userAgent,
        },
      }, 'Twilio');
      if (!response.ok) return response;
      const raw = await providerJson<unknown>(response.data, 'Twilio');
      if (!raw.ok) return raw;
      const validated = twilioResponse.safeParse(raw.data);
      if (!validated.success) return fail('upstream_error', 'Twilio returned an invalid response');
      const data = validated.data;
      return ok({
        number: data.phone_number,
        nationalFormat: data.national_format ?? null,
        countryCode: data.country_code ?? null,
        valid: data.valid,
        lineType: data.line_type_intelligence?.type ?? null,
        carrier: data.line_type_intelligence?.carrier_name ?? null,
      });
    },
  };
}
