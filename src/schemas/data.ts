import { z } from 'zod';

export const dnsQuerySchema = z.object({
  name: z.string().min(1).max(253),
  type: z.enum(['A', 'AAAA', 'MX', 'TXT', 'NS', 'CNAME']).optional().default('A'),
});

export const weatherQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lon: z.coerce.number().min(-180).max(180),
});

export const whoisQuerySchema = z.object({
  domain: z.string().min(1).max(253),
});

export const phoneValidationQuerySchema = z.object({
  number: z.string().trim().min(2).max(250),
  country: z.string().trim().length(2).transform((value) => value.toUpperCase()).optional(),
});

const currencyCode = z.string().trim().length(3).transform((value) => value.toUpperCase());

export const currencyConvertQuerySchema = z.object({
  amount: z.coerce.number().finite().min(0).max(1_000_000_000_000),
  from: currencyCode,
  to: currencyCode,
});
