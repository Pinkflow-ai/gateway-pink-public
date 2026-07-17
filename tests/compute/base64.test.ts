import { describe, it, expect } from 'vitest';
import { base64Provider } from '../../src/providers/compute/base64.js';

const ctx = { requestId: 't', timeoutMs: 1000, userAgent: 'test' };

describe('base64', () => {
  it('encodes text', async () => {
    const r = await base64Provider.execute({ input: 'hi', operation: 'encode' }, ctx);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.output).toBe('aGk=');
  });

  it('decodes back', async () => {
    const r = await base64Provider.execute({ input: 'aGk=', operation: 'decode' }, ctx);
    if (r.ok) expect(r.data.output).toBe('hi');
  });

  it('rejects garbage on decode', async () => {
    const r = await base64Provider.execute({ input: '!!!not-base64!!!', operation: 'decode' }, ctx);
    expect(r.ok).toBe(false);
  });
});
