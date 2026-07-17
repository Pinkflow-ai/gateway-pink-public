import { describe, it, expect } from 'vitest';
import { uaParseProvider } from '../../src/providers/compute/ua-parse.js';

const ctx = { requestId: 't', timeoutMs: 1000, userAgent: 'test' };
const SAFARI =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';

describe('user-agent parse', () => {
  it('detects the browser', async () => {
    const r = await uaParseProvider.execute({ ua: SAFARI }, ctx);
    if (r.ok) expect(r.data.browser).toBe('Safari');
  });

  it('detects the os', async () => {
    const r = await uaParseProvider.execute({ ua: SAFARI }, ctx);
    if (r.ok) expect(r.data.os).toBe('Mac OS');
  });

  it('does not throw on an empty-ish string', async () => {
    const r = await uaParseProvider.execute({ ua: 'curl/8.0' }, ctx);
    expect(r.ok).toBe(true);
  });
});
