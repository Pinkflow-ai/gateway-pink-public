import { describe, expect, it } from 'vitest';
import { slugProvider } from '../../src/providers/compute/slug.js';

const ctx = { requestId: 't', timeoutMs: 1000, userAgent: 'test' };

describe('slug', () => {
  it('normalizes punctuation and Latin diacritics', async () => {
    const result = await slugProvider.execute(
      { input: '  Héllo, Pink World!  ', separator: '-', lowercase: true },
      ctx,
    );
    expect(result).toEqual({ ok: true, data: { slug: 'hello-pink-world' } });
  });

  it('supports underscores and preserving case', async () => {
    const result = await slugProvider.execute(
      { input: 'Pink Gateway', separator: '_', lowercase: false },
      ctx,
    );
    expect(result).toEqual({ ok: true, data: { slug: 'Pink_Gateway' } });
  });
});
