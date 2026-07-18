import { createHmac } from 'node:crypto';

export function apiKeyDigest(token: string, pepper: string): string {
  if (!token) throw new Error('api key is required');
  if (!pepper) throw new Error('api key pepper is required');
  return createHmac('sha256', pepper).update(token, 'utf8').digest('hex');
}
