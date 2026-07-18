import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadPricingManifest } from '../src/billing/manifest.js';
import { ROUTE_POLICIES } from '../src/policy/registry.js';

describe('customer route contract', () => {
  it('keeps runtime routes, pricing manifest, and storage policies synchronized', async () => {
    const app = await buildApp();
    const manifest = loadPricingManifest('./config/pricing.manifest.json');
    const manifestRoutes = Object.keys(manifest.routes).sort();
    const policyRoutes = ROUTE_POLICIES.map(({ route }) => route).sort();
    expect(policyRoutes).toEqual(manifestRoutes);

    for (const route of manifestRoutes) {
      const [method, url] = route.split(' ');
      expect(app.hasRoute({ method, url }), route).toBe(true);
      expect(ROUTE_POLICIES.filter((policy) => policy.route === route), route).toHaveLength(1);
    }
    await app.close();
  });
});
