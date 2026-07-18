import { z } from 'zod';
import { fail, ok, type Provider } from '../_registry.js';
import { providerFetch, providerJson, type Fetcher } from '../http.js';

interface EmailInput { email: string }
interface EmailOutput {
  email: string;
  deliverability: string;
  qualityScore: number | null;
  validFormat: boolean;
  mxFound: boolean;
  smtpValid: boolean;
  disposable: boolean;
  roleAddress: boolean;
  catchAll: boolean;
}
const flag = z.object({ value: z.boolean() }).passthrough();
const abstractResponse = z.object({
  email: z.string().email(),
  deliverability: z.string().min(1),
  quality_score: z.union([z.string(), z.number()]),
  is_valid_format: flag,
  is_mx_found: flag,
  is_smtp_valid: flag,
  is_disposable_email: flag,
  is_role_email: flag,
  is_catchall_email: flag,
}).passthrough();

export function createEmailValidationProvider(apiKey: string, fetcher: Fetcher = fetch): Provider<EmailInput, EmailOutput> {
  return {
    id: 'email.abstract-validation',
    storagePolicy: 'metadata-only',
    source: { name: 'Abstract Email Validation API', url: 'https://www.abstractapi.com/api/email-verification-validation-api', license: 'Commercial API' },
    async execute({ email }, ctx) {
      if (!apiKey) return fail('provider_unavailable', 'email validation provider is not configured');
      const url = new URL('https://emailvalidation.abstractapi.com/v1/');
      url.searchParams.set('api_key', apiKey);
      url.searchParams.set('email', email);
      const response = await providerFetch(fetcher, url, {
        signal: AbortSignal.timeout(ctx.timeoutMs),
        headers: { 'user-agent': ctx.userAgent },
      }, 'Abstract');
      if (!response.ok) return response;
      const raw = await providerJson<unknown>(response.data, 'Abstract');
      if (!raw.ok) return raw;
      const validated = abstractResponse.safeParse(raw.data);
      if (!validated.success) return fail('upstream_error', 'Abstract returned an invalid response');
      const data = validated.data;
      const qualityScore = Number(data.quality_score);
      return ok({
        email: data.email,
        deliverability: data.deliverability.toLowerCase(),
        qualityScore: Number.isFinite(qualityScore) ? qualityScore : null,
        validFormat: data.is_valid_format.value,
        mxFound: data.is_mx_found.value,
        smtpValid: data.is_smtp_valid.value,
        disposable: data.is_disposable_email.value,
        roleAddress: data.is_role_email.value,
        catchAll: data.is_catchall_email.value,
      });
    },
  };
}
