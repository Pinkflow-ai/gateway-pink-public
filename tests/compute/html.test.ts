import { describe, it, expect } from 'vitest';
import { htmlProvider } from '../../src/providers/compute/html.js';

const ctx = { requestId: 't', timeoutMs: 1000, userAgent: 'test' };

describe('html escape', () => {
  it('escapes angle brackets and quotes', async () => {
    const r = await htmlProvider.execute({ input: '<a href="x">', operation: 'encode' }, ctx);
    if (r.ok) expect(r.data.output).toBe('&lt;a href=&quot;x&quot;&gt;');
  });

  it('round-trips', async () => {
    const enc = await htmlProvider.execute({ input: '<b>hi</b>', operation: 'encode' }, ctx);
    if (enc.ok) {
      const dec = await htmlProvider.execute({ input: enc.data.output, operation: 'decode' }, ctx);
      if (dec.ok) expect(dec.data.output).toBe('<b>hi</b>');
    }
  });
});
