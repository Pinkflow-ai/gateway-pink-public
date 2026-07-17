import { describe, expect, it } from 'vitest';
import { dummyProvider } from '../../src/providers/compute/dummy.js';

const ctx = { requestId: 't', timeoutMs: 1000, userAgent: 'test' };

describe('dummy data', () => {
  it('generates the requested number of words', async () => {
    const result = await dummyProvider.execute({ type: 'words', count: 5 }, ctx);
    expect(result).toMatchObject({
      ok: true,
      data: { type: 'words', count: 5 },
    });
    if (result.ok) expect(result.data.items[0].split(' ')).toHaveLength(5);
  });

  it('returns structured fake users without external calls', async () => {
    const result = await dummyProvider.execute({ type: 'user', count: 2 }, ctx);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.data.items).toHaveLength(2);
    expect(result.data.items[0]).toMatchObject({
      name: expect.any(String),
      email: expect.stringMatching(/@example\.test$/),
    });
  });
});
