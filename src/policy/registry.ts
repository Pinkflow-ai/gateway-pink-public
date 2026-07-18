/**
 * How a route's payload may be persisted (catalog-and-pricing-strategy.md §6).
 *
 * - 'none'          compute-only — bytes never touch disk, log, or cache.
 *                   Enforced by tests/guard-no-payload.test.ts.
 * - 'metadata-only' payload not stored; only the usage/billing row is.
 * - 'cached-ttl'    response cached for a declared TTL (DNS, weather, RDAP).
 * - 'persisted'     payload stored. Reserved for future write-APIs; none in v1.
 */
export type StoragePolicy = 'none' | 'metadata-only' | 'cached-ttl' | 'persisted';

/** The route-identifying HTTP method + path, e.g. 'GET /v1/dns/resolve'. */
export type RouteKey = string;

export interface RoutePolicy {
  route: RouteKey;
  storagePolicy: StoragePolicy;
  /** Whether the payload bytes are ever stored anywhere. */
  storesPayload: boolean;
}

/**
 * The per-route storage posture. This is the same data returned by
 * GET /v1/storage-policy and rendered by the trust page — one source of truth.
 */
export const ROUTE_POLICIES: RoutePolicy[] = [
  // compute-only cluster — never persisted
  { route: 'POST /v1/compute/base64', storagePolicy: 'none', storesPayload: false },
  { route: 'POST /v1/compute/hash', storagePolicy: 'none', storesPayload: false },
  { route: 'POST /v1/compute/hmac', storagePolicy: 'none', storesPayload: false },
  { route: 'GET /v1/compute/uuid', storagePolicy: 'none', storesPayload: false },
  { route: 'GET /v1/compute/password', storagePolicy: 'none', storesPayload: false },
  { route: 'POST /v1/compute/jwt/decode', storagePolicy: 'none', storesPayload: false },
  { route: 'POST /v1/compute/json', storagePolicy: 'none', storesPayload: false },
  { route: 'GET /v1/compute/ua', storagePolicy: 'none', storesPayload: false },
  { route: 'POST /v1/compute/url', storagePolicy: 'none', storesPayload: false },
  { route: 'POST /v1/compute/html', storagePolicy: 'none', storesPayload: false },
  { route: 'GET /v1/compute/dummy', storagePolicy: 'none', storesPayload: false },
  { route: 'POST /v1/compute/slug', storagePolicy: 'none', storesPayload: false },
  { route: 'POST /v1/compute/units', storagePolicy: 'none', storesPayload: false },
  { route: 'GET /v1/compute/time', storagePolicy: 'none', storesPayload: false },
  { route: 'POST /v1/compute/qr', storagePolicy: 'none', storesPayload: false },
  { route: 'POST /v1/compute/json-schema', storagePolicy: 'none', storesPayload: false },
  { route: 'POST /v1/compute/csv', storagePolicy: 'none', storesPayload: false },
  { route: 'POST /v1/compute/color', storagePolicy: 'none', storesPayload: false },
  { route: 'POST /v1/compute/text-stats', storagePolicy: 'none', storesPayload: false },
  { route: 'POST /v1/security/password-exposure', storagePolicy: 'none', storesPayload: false },

  // data APIs — payload not stored, response cached briefly for quota economy
  { route: 'GET /v1/dns/resolve', storagePolicy: 'cached-ttl', storesPayload: false },
  { route: 'GET /v1/weather', storagePolicy: 'cached-ttl', storesPayload: false },
  { route: 'GET /v1/whois/lookup', storagePolicy: 'metadata-only', storesPayload: false },

  // paid APIs — request payload is forwarded, never persisted by Gateway.pink
  { route: 'POST /v1/email/validate', storagePolicy: 'metadata-only', storesPayload: false },
  { route: 'GET /v1/phone/lookup', storagePolicy: 'metadata-only', storesPayload: false },
  { route: 'POST /v1/screenshot', storagePolicy: 'metadata-only', storesPayload: false },
  { route: 'POST /v1/ai/summarize', storagePolicy: 'metadata-only', storesPayload: false },
  { route: 'POST /v1/browser/screenshot', storagePolicy: 'metadata-only', storesPayload: false },
  { route: 'POST /v1/browser/pdf', storagePolicy: 'metadata-only', storesPayload: false },
  { route: 'POST /v1/browser/markdown', storagePolicy: 'metadata-only', storesPayload: false },
];

/** Operational routes are visible in the storage disclosure but are not
 * customer API products and therefore do not belong in the pricing manifest. */
export const OPERATIONAL_ROUTE_POLICIES: RoutePolicy[] = [
  { route: 'POST /v1/billing/checkout', storagePolicy: 'metadata-only', storesPayload: false },
  { route: 'GET /v1/mcp/entitlement', storagePolicy: 'metadata-only', storesPayload: false },
  { route: 'POST /webhooks/paddle', storagePolicy: 'metadata-only', storesPayload: false },
];

const ALL_ROUTE_POLICIES = [...ROUTE_POLICIES, ...OPERATIONAL_ROUTE_POLICIES];

/** Routes that carry the X-Gateway-No-Store header. */
export const NO_STORE_ROUTES = new Set(
  ALL_ROUTE_POLICIES.filter((r) => r.storagePolicy === 'none').map((r) => r.route),
);

/** Lookup by route key. */
export const policyFor = (route: RouteKey): RoutePolicy | undefined =>
  ALL_ROUTE_POLICIES.find((r) => r.route === route);

/** The machine-readable table surfaced at GET /v1/storage-policy. */
export const storagePolicyTable = ALL_ROUTE_POLICIES.map((r) => ({
  endpoint: r.route,
  storagePolicy: r.storagePolicy,
  storesPayload: r.storesPayload,
}));
