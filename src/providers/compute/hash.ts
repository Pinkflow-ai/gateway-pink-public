import { createHash } from 'node:crypto';
import { ok, fail, type Provider } from '../_registry.js';

type Algo = 'md5' | 'sha1' | 'sha256' | 'sha512';
interface HashInput {
  input: string;
  algorithm: Algo;
}
interface HashOutput {
  algorithm: Algo;
  digest: string;
}

/** FIPS 180-4 digest. Pure CPU. */
export const hashProvider: Provider<HashInput, HashOutput> = {
  id: 'compute.hash',
  storagePolicy: 'none',
  source: {
    name: 'Pure compute (FIPS 180-4)',
    url: 'https://nvlpubs.nist.gov/nistpubs/FIPS/NIST.FIPS.180-4.pdf',
    license: 'Public standard',
  },
  async execute({ input, algorithm }) {
    if (!['md5', 'sha1', 'sha256', 'sha512'].includes(algorithm)) {
      return fail('bad_input', `unknown algorithm: ${algorithm}`);
    }
    const digest = createHash(algorithm).update(input, 'utf8').digest('hex');
    return ok({ algorithm, digest });
  },
};
