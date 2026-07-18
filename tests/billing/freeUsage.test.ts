import { describe, expect, it, vi } from 'vitest';
import { buildApp } from '../../src/app.js';
import { PostgresFreeUsageRecorder } from '../../src/billing/freeUsage.js';

const principal = { orgId: 'org-1', apiKeyId: 'key-1', mcpEnabled: false };

describe('free authenticated usage', () => {
  it('records one metadata-only row after a terminal free response', async () => {
    const record = vi.fn(async () => undefined);
    const app = await buildApp({
      authenticator: { authenticate: async () => principal },
      freeUsageRecorder: { record },
    });
    const response = await app.inject({
      method: 'GET', url: '/v1/compute/uuid', headers: { authorization: 'Bearer gp_live_test' },
    });
    expect(response.statusCode).toBe(200);
    expect(record).toHaveBeenCalledOnce();
    expect(record.mock.calls[0]?.[0]).toMatchObject({
      orgId: 'org-1', apiKeyId: 'key-1', endpoint: 'GET /v1/compute/uuid',
      httpStatus: 200, success: true,
    });
    expect(record.mock.calls[0]?.[0].requestId).toBe(response.headers['x-request-id']);
    expect(record.mock.calls[0]?.[0].durationMs).toEqual(expect.any(Number));
    expect(Object.keys(record.mock.calls[0]?.[0]).sort()).toEqual([
      'apiKeyId', 'durationMs', 'endpoint', 'httpStatus', 'orgId', 'requestId', 'success',
    ]);
    await app.close();
  });

  it('does not record public probes, auth failures, or paid routes', async () => {
    const record = vi.fn(async () => undefined);
    const app = await buildApp({
      authenticator: { authenticate: async (token) => token === 'gp_live_test' ? principal : null },
      freeUsageRecorder: { record },
    });
    await app.inject('/health');
    await app.inject('/v1/compute/uuid');
    await app.inject({
      method: 'POST', url: '/v1/email/validate',
      headers: { authorization: 'Bearer gp_live_test', 'idempotency-key': 'paid' },
      payload: { email: 'person@example.com' },
    });
    expect(record).not.toHaveBeenCalled();
    await app.close();
  });

  it('calls record_free_usage with no request or response payload fields', async () => {
    const query = vi.fn(async () => ({ rows: [{ record_free_usage: null }], rowCount: 1 }));
    const recorder = new PostgresFreeUsageRecorder({ query });
    await recorder.record({
      orgId: 'org-1', apiKeyId: 'key-1', endpoint: 'POST /v1/compute/hash',
      requestId: 'request-1', httpStatus: 400, success: false, durationMs: 12,
    });
    expect(query.mock.calls[0]?.[0]).toContain('record_free_usage');
    expect(query.mock.calls[0]?.[1]).toEqual([
      'org-1', 'key-1', 'POST /v1/compute/hash', 'request-1', 400, false, 12,
    ]);
  });
});
