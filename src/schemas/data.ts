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
