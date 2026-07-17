import { ok, fail, type Provider } from '../_registry.js';

interface UaInput {
  ua: string;
}
interface UaOutput {
  browser: string;
  engine: string;
  os: string;
  device: string;
}

// Pinned to v1.x — v2.x of ua-parser-js is AGPL and explicitly excluded
// (catalog-and-pricing-strategy.md §8).
import UAParser from 'ua-parser-js';

/** MIT-licensed UA parser (v1.x). Pure CPU. */
export const uaParseProvider: Provider<UaInput, UaOutput> = {
  id: 'compute.ua',
  storagePolicy: 'none',
  source: {
    name: 'ua-parser-js v1.x (MIT)',
    url: 'https://github.com/faisalman/ua-parser-js',
    license: 'MIT',
    notes: 'Pinned to v1.x; v2.x is AGPL and excluded.',
  },
  async execute({ ua }) {
    if (!ua) return fail('bad_input', 'missing ua');
    const parsed = new UAParser(ua).getResult();
    return ok({
      browser: parsed.browser.name ?? 'unknown',
      engine: parsed.engine.name ?? 'unknown',
      os: parsed.os.name ?? 'unknown',
      device: parsed.device.type ?? parsed.device.model ?? 'unknown',
    });
  },
};
