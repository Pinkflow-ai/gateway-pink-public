import { ok, fail, type Provider } from '../_registry.js';

type Algo = 'encode' | 'decode';
interface Base64Input {
  input: string;
  operation: Algo;
}
interface Base64Output {
  output: string;
}

/** RFC 4648. Pure CPU — bytes never leave memory. */
export const base64Provider: Provider<Base64Input, Base64Output> = {
  id: 'compute.base64',
  storagePolicy: 'none',
  source: {
    name: 'Pure compute (RFC 4648)',
    url: 'https://www.rfc-editor.org/rfc/rfc4648',
    license: 'Public standard',
  },
  async execute({ input, operation }) {
    try {
      if (operation === 'encode') {
        return ok({ output: Buffer.from(input, 'utf8').toString('base64') });
      }
      // Decode only if the input is clean base64. Node's Buffer.from is lenient
      // (drops garbage chars silently), so we validate first.
      if (!/^[A-Za-z0-9+/]*={0,2}$/.test(input)) {
        return fail('bad_input', 'not valid base64');
      }
      return ok({ output: Buffer.from(input, 'base64').toString('utf8') });
    } catch {
      return fail('bad_input', 'not valid base64');
    }
  },
};
