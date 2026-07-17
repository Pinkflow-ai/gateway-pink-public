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
interface AbstractFlag { value?: boolean }
interface AbstractResponse {
  email?: string;
  deliverability?: string;
  quality_score?: string;
  is_valid_format?: AbstractFlag;
  is_mx_found?: AbstractFlag;
  is_smtp_valid?: AbstractFlag;
  is_disposable_email?: AbstractFlag;
  is_role_email?: AbstractFlag;
  is_catchall_email?: AbstractFlag;
}

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
      const raw = await providerJson<AbstractResponse>(response.data, 'Abstract');
      if (!raw.ok) return raw;
      const qualityScore = Number(raw.data.quality_score);
      return ok({
        email: raw.data.email ?? email,
        deliverability: (raw.data.deliverability ?? 'unknown').toLowerCase(),
        qualityScore: Number.isFinite(qualityScore) ? qualityScore : null,
        validFormat: raw.data.is_valid_format?.value === true,
        mxFound: raw.data.is_mx_found?.value === true,
        smtpValid: raw.data.is_smtp_valid?.value === true,
        disposable: raw.data.is_disposable_email?.value === true,
        roleAddress: raw.data.is_role_email?.value === true,
        catchAll: raw.data.is_catchall_email?.value === true,
      });
    },
  };
}
