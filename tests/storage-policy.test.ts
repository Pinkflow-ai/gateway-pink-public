import { describe, it, expect } from 'vitest';
import { storagePolicyTable, ROUTE_POLICIES, NO_STORE_ROUTES } from '../src/policy/registry.js';

describe('storage policy table', () => {
  it('lists every route with its storage posture', () => {
    expect(storagePolicyTable.length).toBe(ROUTE_POLICIES.length);
    for (const row of storagePolicyTable) {
      expect(typeof row.endpoint).toBe('string');
      expect(['none', 'metadata-only', 'cached-ttl', 'persisted']).toContain(row.storagePolicy);
    }
  });

  it('marks payload storage as false for every v1 route', () => {
    // No v1 route persists payload bytes. persisted tier is reserved.
    for (const row of storagePolicyTable) {
      expect(row.storesPayload).toBe(false);
    }
  });

  it('flags the compute routes as no-store', () => {
    expect(NO_STORE_ROUTES.has('POST /v1/compute/hash')).toBe(true);
    expect(NO_STORE_ROUTES.has('GET /v1/compute/dummy')).toBe(true);
    expect(NO_STORE_ROUTES.has('POST /v1/compute/slug')).toBe(true);
    expect(NO_STORE_ROUTES.has('POST /v1/compute/units')).toBe(true);
    expect(NO_STORE_ROUTES.has('GET /v1/compute/time')).toBe(true);
    expect(NO_STORE_ROUTES.has('GET /v1/dns/resolve')).toBe(false);
  });
});
