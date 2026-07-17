import { ok, fail, type Provider } from '../_registry.js';

type Op = 'format' | 'minify' | 'validate';
interface JsonInput {
  input: string;
  operation: Op;
}
interface JsonOutput {
  valid: boolean;
  output?: string;
}

/** RFC 8259 formatter/minifier/validator. Pure CPU. */
export const jsonProvider: Provider<JsonInput, JsonOutput> = {
  id: 'compute.json',
  storagePolicy: 'none',
  source: {
    name: 'Pure compute (RFC 8259)',
    url: 'https://www.rfc-editor.org/rfc/rfc8259',
    license: 'Public standard',
  },
  async execute({ input, operation }) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(input);
    } catch {
      return ok({ valid: false });
    }
    if (operation === 'validate') return ok({ valid: true });
    if (operation === 'minify') return ok({ valid: true, output: JSON.stringify(parsed) });
    if (operation === 'format') return ok({ valid: true, output: JSON.stringify(parsed, null, 2) });
    return fail('bad_input', `unknown operation: ${operation}`);
  },
};
