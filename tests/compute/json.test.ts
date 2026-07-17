import { describe, it, expect } from 'vitest';
import { jsonProvider } from '../../src/providers/compute/json.js';

const ctx = { requestId: 't', timeoutMs: 1000, userAgent: 'test' };

describe('json ops', () => {
  it('pretty-prints', async () => {
    const r = await jsonProvider.execute({ input: '{"a":1}', operation: 'format' }, ctx);
    if (r.ok) expect(r.data.output).toBe('{\n  "a": 1\n}');
  });

  it('minifies', async () => {
    const r = await jsonProvider.execute({ input: '{ "a" : 1 }', operation: 'minify' }, ctx);
    if (r.ok) expect(r.data.output).toBe('{"a":1}');
  });

  it('validates good json', async () => {
    const r = await jsonProvider.execute({ input: '[1,2,3]', operation: 'validate' }, ctx);
    if (r.ok) expect(r.data.valid).toBe(true);
  });

  it('flags broken json', async () => {
    const r = await jsonProvider.execute({ input: '{a:}', operation: 'validate' }, ctx);
    if (r.ok) expect(r.data.valid).toBe(false);
  });
});
