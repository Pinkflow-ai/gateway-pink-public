import { createHmac } from 'node:crypto';
import { ok, fail, type Provider } from '../_registry.js';

type Algo = 'sha256' | 'sha512';
interface HmacInput {
  message: string;
  secret: string;
  algorithm?: Algo;
}
interface HmacOutput {
  algorithm: Algo;
  tag: string;
}

/** FIPS 198-1 keyed hash. Pure CPU. */
export const hmacProvider: Provider<HmacInput, HmacOutput> = {
  id: 'compute.hmac',
  storagePolicy: 'none',
  source: {
    name: 'Pure compute (FIPS 198-1)',
    url: 'https://nvlpubs.nist.gov/nistpubs/FIPS/NIST.FIPS.198-1.pdf',
    license: 'Public standard',
  },
  async execute({ message, secret, algorithm = 'sha256' }) {
    if (!['sha256', 'sha512'].includes(algorithm)) {
      return fail('bad_input', `unknown algorithm: ${algorithm}`);
    }
    const tag = createHmac(algorithm, secret).update(message, 'utf8').digest('hex');
    return ok({ algorithm, tag });
  },
};
