import { randomInt } from 'node:crypto';
import { ok, type Provider } from '../_registry.js';

interface PasswordInput {
  length?: number;
  symbols?: boolean;
}
interface PasswordOutput {
  password: string;
  length: number;
}

const LOWER = 'abcdefghijklmnopqrstuvwxyz';
const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const DIGITS = '0123456789';
const SYMBOLS = '!@#$%^&*()-_=+[]{};:,.?';

function pick(pool: string): string {
  return pool[randomInt(0, pool.length)];
}

/** CSPRNG-backed random password/token. Pure CPU. */
export const passwordProvider: Provider<PasswordInput, PasswordOutput> = {
  id: 'compute.password',
  storagePolicy: 'none',
  source: {
    name: 'Pure compute (language CSPRNG)',
    url: 'https://nodejs.org/api/crypto.html#cryptorandomintmax-min-callback',
    license: 'Public standard',
  },
  async execute({ length = 24, symbols = true }) {
    const len = Math.min(Math.max(8, length), 256);
    const pool = LOWER + UPPER + DIGITS + (symbols ? SYMBOLS : '');
    const chars = Array.from({ length: len }, () => pick(pool));
    return ok({ password: chars.join(''), length: len });
  },
};
