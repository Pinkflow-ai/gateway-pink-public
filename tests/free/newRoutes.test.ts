import { describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { ok, type Provider } from '../../src/providers/_registry.js';

const source = { name: 'fixture', url: 'https://example.test', license: 'test' };
const phoneProvider: Provider<unknown, unknown> = {
  id: 'phone.validate', source, storagePolicy: 'none',
  execute: async () => ok({ valid: true, e164: '+41446681800' }),
};
const fxProvider: Provider<unknown, unknown> = {
  id: 'currency.ecb-reference', source, storagePolicy: 'cached-ttl',
  execute: async () => ok({ result: 80, sourceDate: '2026-07-17' }),
};

describe('new free routes', () => {
  it('serves phone validation with the no-payload-storage contract', async () => {
    const app = await buildApp({ phoneValidationProvider: phoneProvider, fxProvider });
    const response = await app.inject({ method: 'GET', url: '/v1/phone/validate?number=%2B41446681800' });
    expect(response.statusCode).toBe(200);
    expect(response.headers['x-gateway-storage-policy']).toBe('none');
    expect(response.headers['x-gateway-no-store']).toBe('true');
    await app.close();
  });

  it('validates and normalizes the currency query before the provider call', async () => {
    const app = await buildApp({ phoneValidationProvider: phoneProvider, fxProvider });
    const response = await app.inject({ method: 'GET', url: '/v1/currency/convert?amount=110&from=usd&to=gbp' });
    expect(response.statusCode).toBe(200);
    expect(response.headers['x-gateway-storage-policy']).toBe('cached-ttl');
    expect(response.json()).toMatchObject({ data: { result: 80 }, _source: { name: 'fixture' } });
    await app.close();
  });
});
