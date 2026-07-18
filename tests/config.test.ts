import { describe, expect, it } from 'vitest';
import { parseConfig } from '../src/config.js';

describe('configuration safety', () => {
  it('allows anonymous mode only while billing is off', () => {
    expect(parseConfig({ BILLING_MODE: 'off', GATEWAY_DEV_KEYS: '' }).billingMode).toBe('off');
    expect(() => parseConfig({ BILLING_MODE: 'memory', GATEWAY_DEV_KEYS: '' }))
      .toThrow('paid billing requires at least one gateway dev key');
  });

  it('allows memory billing with an authenticated development key', () => {
    expect(parseConfig({ BILLING_MODE: 'memory', GATEWAY_DEV_KEYS: 'gp_test' }).billingMode)
      .toBe('memory');
  });
});
