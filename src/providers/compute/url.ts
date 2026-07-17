import { ok, fail, type Provider } from '../_registry.js';

type Op = 'encode' | 'decode';
interface UrlInput {
  input: string;
  operation: Op;
}
interface UrlOutput {
  output: string;
}

/** RFC 3986 percent codec. Pure CPU. */
export const urlProvider: Provider<UrlInput, UrlOutput> = {
  id: 'compute.url',
  storagePolicy: 'none',
  source: {
    name: 'Pure compute (RFC 3986)',
    url: 'https://www.rfc-editor.org/rfc/rfc3986',
    license: 'Public standard',
  },
  async execute({ input, operation }) {
    try {
      if (operation === 'encode') return ok({ output: encodeURIComponent(input) });
      return ok({ output: decodeURIComponent(input) });
    } catch {
      return fail('bad_input', 'not a valid percent-encoded string');
    }
  },
};
