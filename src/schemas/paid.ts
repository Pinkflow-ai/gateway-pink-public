import { z } from 'zod';
import { isIP } from 'node:net';

export const emailValidationSchema = z.object({
  email: z.string().trim().email().max(320),
});

export const phoneLookupQuerySchema = z.object({
  number: z.string().regex(/^\+[1-9]\d{6,14}$/, 'number must be E.164, including +country code'),
});

function safePublicUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return false;
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (host === 'localhost' || host.endsWith('.localhost') || host === '0.0.0.0' || host === '::1') return false;
    if (host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.lan') || host.endsWith('.home')) return false;
    const ipVersion = isIP(host);
    if (ipVersion === 4) {
      const [a, b, c] = host.split('.').map(Number);
      if (a === 0 || a === 10 || a === 127 || a >= 224
        || (a === 100 && b >= 64 && b <= 127)
        || (a === 169 && b === 254)
        || (a === 172 && b >= 16 && b <= 31)
        || (a === 192 && b === 168)
        || (a === 192 && b === 0 && (c === 0 || c === 2))
        || (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100)))
        || (a === 203 && b === 0 && c === 113)) return false;
    } else if (ipVersion === 6) {
      // Public unicast is currently 2000::/3. Documentation and mapped/local
      // ranges are rejected, including ::ffff:127.0.0.1.
      if (!/^[23]/.test(host) || host.startsWith('2001:db8:')) return false;
    } else if (!host.includes('.')) {
      return false;
    }
    return true;
  } catch { return false; }
}

export const screenshotSchema = z.object({
  url: z.string().max(2_048).refine(safePublicUrl, 'url must be a public HTTP(S) URL'),
  format: z.enum(['png', 'jpeg', 'webp']).optional().default('png'),
  full_page: z.boolean().optional().default(false),
  viewport_width: z.number().int().min(320).max(3_840).optional().default(1280),
  viewport_height: z.number().int().min(200).max(2_160).optional().default(720),
});

export const summarizeSchema = z.object({
  text: z.string().min(1).max(50_000),
  style: z.enum(['concise', 'bullets', 'detailed']).optional().default('concise'),
  max_output_tokens: z.number().int().min(32).max(1_024).optional().default(1_024),
  max_credits: z.number().int().min(1).max(100).optional().default(100),
});

const MAX_OCR_BYTES = 5 * 1024 * 1024;
const MAX_OCR_BASE64_CHARACTERS = Math.ceil(MAX_OCR_BYTES / 3) * 4;
export const OCR_HTTP_BODY_LIMIT = MAX_OCR_BASE64_CHARACTERS + 1_024;
const standardBase64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

export const ocrDocumentSchema = z.object({
  image_base64: z.string().min(4).max(MAX_OCR_BASE64_CHARACTERS).regex(
    standardBase64,
    'image_base64 must be standard base64 without a data URL prefix',
  ),
  format: z.enum(['png', 'jpeg']),
}).strict().superRefine((input, ctx) => {
  const bytes = Buffer.from(input.image_base64, 'base64');
  if (bytes.byteLength > MAX_OCR_BYTES) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['image_base64'], message: 'document exceeds 5 MB' });
    return;
  }
  const png = bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const jpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if ((input.format === 'png' && !png) || (input.format === 'jpeg' && !jpeg)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['image_base64'], message: `bytes do not match ${input.format} format` });
  }
});

export const browserScreenshotSchema = z.object({
  url: z.string().max(2_048).refine(safePublicUrl, 'url must be a public HTTP(S) URL'),
  format: z.enum(['png', 'jpeg']).optional().default('png'),
  full_page: z.boolean().optional().default(false),
  viewport_width: z.number().int().min(320).max(1_920).optional().default(1_280),
  viewport_height: z.number().int().min(200).max(1_080).optional().default(720),
});

export const browserUrlSchema = z.object({
  url: z.string().max(2_048).refine(safePublicUrl, 'url must be a public HTTP(S) URL'),
});
