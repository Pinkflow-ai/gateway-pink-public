import { ok, fail, type Provider } from '../_registry.js';

type Op = 'encode' | 'decode';
interface HtmlInput {
  input: string;
  operation: Op;
}
interface HtmlOutput {
  output: string;
}

const ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};
const DECODED = Object.entries(ENTITIES).sort((a, b) => b[1].length - a[1].length);

/** HTML5 entity escape/unescape for the XSS-relevant set. Pure CPU. */
export const htmlProvider: Provider<HtmlInput, HtmlOutput> = {
  id: 'compute.html',
  storagePolicy: 'none',
  source: {
    name: 'Pure compute (HTML5 spec)',
    url: 'https://html.spec.whatwg.org/multipage/named-characters.html',
    license: 'Public standard',
  },
  async execute({ input, operation }) {
    if (operation === 'encode') {
      let out = input;
      for (const [char, ent] of Object.entries(ENTITIES)) out = out.replaceAll(char, ent);
      return ok({ output: out });
    }
    if (operation === 'decode') {
      let out = input;
      for (const [char, ent] of DECODED) out = out.replaceAll(ent, char);
      return ok({ output: out });
    }
    return fail('bad_input', `unknown operation: ${operation}`);
  },
};
