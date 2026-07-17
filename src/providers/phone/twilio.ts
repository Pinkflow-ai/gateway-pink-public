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
interface TwilioResponse {
  phone_number?: string;
  national_format?: string;
  country_code?: string;
  valid?: boolean;
  line_type_intelligence?: { type?: string; carrier_name?: string; error_code?: number | null } | null;
}

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
      const raw = await providerJson<TwilioResponse>(response.data, 'Twilio');
      if (!raw.ok) return raw;
      return ok({
        number: raw.data.phone_number ?? number,
        nationalFormat: raw.data.national_format ?? null,
        countryCode: raw.data.country_code ?? null,
        valid: raw.data.valid === true,
        lineType: raw.data.line_type_intelligence?.type ?? null,
        carrier: raw.data.line_type_intelligence?.carrier_name ?? null,
      });
    },
  };
}
