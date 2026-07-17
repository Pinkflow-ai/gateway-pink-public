import { describe, it, expect } from 'vitest';
import { urlProvider } from '../../src/providers/compute/url.js';

const ctx = { requestId: 't', timeoutMs: 1000, userAgent: 'test' };

describe('url codec', () => {
  it('encodes spaces and ampersands', async () => {
    const r = await urlProvider.execute({ input: 'a b & c', operation: 'encode' }, ctx);
    if (r.ok) expect(r.data.output).toBe('a%20b%20%26%20c');
  });

  it('decodes back', async () => {
    const r = await urlProvider.execute({ input: 'a%20b%20%26%20c', operation: 'decode' }, ctx);
    if (r.ok) expect(r.data.output).toBe('a b & c');
  });
});
