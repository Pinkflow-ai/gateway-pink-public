import { describe, expect, it } from 'vitest';
import { screenshotSchema } from '../../src/schemas/paid.js';

describe('paid route schemas', () => {
  it.each([
    'http://[::1]/',
    'http://[fc00::1]/',
    'http://[fd12:3456::1]/',
    'http://[fe80::1]/',
    'http://[::ffff:127.0.0.1]/',
  ])('rejects non-public IPv6 screenshot targets: %s', (url) => {
    expect(screenshotSchema.safeParse({ url }).success).toBe(false);
  });

  it('accepts a globally routable IPv6 screenshot target', () => {
    expect(screenshotSchema.safeParse({ url: 'https://[2606:4700:4700::1111]/' }).success).toBe(true);
  });
});
