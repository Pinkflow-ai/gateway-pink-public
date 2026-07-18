import { describe, expect, it, vi } from 'vitest';
import { createPasswordExposureProvider } from '../../src/providers/security/hibp.js';

const ctx = { requestId: 'test', timeoutMs: 1000, userAgent: 'gateway-test' };

describe('HIBP password exposure provider', () => {
  it('sends only the five-character prefix with padding enabled', async () => {
    const fetcher = vi.fn(async () => new Response(`00112233445566778899AABBCCDDEEFF001:42\nFFFFF000000000000000000000000000000:0\n`));
    const provider = createPasswordExposureProvider(fetcher);
    const result = await provider.execute({ sha1: 'ABCDE00112233445566778899AABBCCDDEEFF001' }, ctx);
    expect(result).toEqual({ ok: true, data: { exposed: true, count: 42 } });
    expect(String(fetcher.mock.calls[0][0])).toBe('https://api.pwnedpasswords.com/range/ABCDE');
    expect(fetcher.mock.calls[0][1]?.headers).toMatchObject({ 'Add-Padding': 'true' });
    expect(String(fetcher.mock.calls[0][0])).not.toContain('00112233445566778899AABBCCDDEEFF001');
  });

  it('normalizes timeout failures', async () => {
    const provider = createPasswordExposureProvider(vi.fn(async () => {
      throw new DOMException('timed out', 'TimeoutError');
    }));
    expect(await provider.execute({ sha1: 'ABCDE00112233445566778899AABBCCDDEEFF001' }, ctx)).toEqual({
      ok: false, error: { code: 'upstream_timeout', message: 'HIBP timed out' },
    });
  });
});
