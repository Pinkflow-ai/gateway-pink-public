import { describe, expect, it, vi } from 'vitest';
import { PostgresUsageMeter } from '../../src/billing/postgres.js';

const identity = { orgId: '00000000-0000-4000-8000-000000000001', apiKeyId: '00000000-0000-4000-8000-000000000002' };
const reservationRow = {
  reservation_id: '00000000-0000-4000-8000-000000000003',
  reserved_credits: 17,
  available_credits: 83,
  reservation_state: 'active',
};

function querySequence(...results: Array<{ rows?: unknown[]; rowCount?: number } | Error>) {
  return vi.fn(async () => {
    const result = results.shift();
    if (result instanceof Error) throw result;
    return { rows: result?.rows ?? [], rowCount: result?.rowCount ?? result?.rows?.length ?? 0 };
  });
}

describe('Postgres usage meter', () => {
  it('reserves against the authenticated org and API key', async () => {
    const query = querySequence({ rows: [reservationRow] });
    const meter = new PostgresUsageMeter({ query });
    const result = await meter.reserve(identity, 'request-1', 'POST /v1/email/validate', 17, 'fingerprint-1');

    expect(result).toEqual({
      ok: true,
      reservation: {
        id: reservationRow.reservation_id,
        ...identity,
        requestId: 'request-1',
        route: 'POST /v1/email/validate',
        reservedCredits: 17,
        inputFingerprint: 'fingerprint-1',
      },
      availableCredits: 83,
    });
    expect(query.mock.calls[0]?.[0]).toContain('reserve_credits');
    expect(query.mock.calls[0]?.[1]?.slice(0, 6)).toEqual([
      identity.orgId, identity.apiKeyId, 'POST /v1/email/validate', 'request-1', 17, 'fingerprint-1',
    ]);
  });

  it.each([
    ['idempotency_mismatch', 'idempotency_mismatch'],
    ['request_in_progress', 'request_in_progress'],
    ['billing_unknown', 'billing_unknown'],
    ['request_already_settled', 'request_already_settled'],
    ['request_already_failed', 'request_already_failed'],
    ['route_disabled', 'route_disabled'],
    ['org_billing_disabled', 'org_billing_disabled'],
    ['billing_debt', 'billing_debt'],
  ] as const)('maps %s reserve failures without calling a provider', async (message, reason) => {
    const meter = new PostgresUsageMeter({ query: querySequence(new Error(message)) });
    await expect(meter.reserve(identity, 'request-1', 'route', 17, 'fingerprint'))
      .resolves.toEqual({ ok: false, reason, availableCredits: 0 });
  });

  it('returns the database-reported available balance on insufficient credits', async () => {
    const meter = new PostgresUsageMeter({
      query: querySequence(new Error('insufficient_credits: requested 17, available 4')),
    });
    await expect(meter.reserve(identity, 'request-1', 'route', 17, 'fingerprint'))
      .resolves.toEqual({ ok: false, reason: 'insufficient_credits', availableCredits: 4 });
  });

  it('fails closed for connectivity and unknown database outcomes', async () => {
    for (const error of [new Error('connect ECONNREFUSED'), new Error('unexpected function result')]) {
      const meter = new PostgresUsageMeter({ query: querySequence(error) });
      await expect(meter.reserve(identity, 'request-1', 'route', 17, 'fingerprint'))
        .resolves.toEqual({ ok: false, reason: 'unavailable', availableCredits: 0 });
    }
  });

  it('prepares and settles usage with durable metadata', async () => {
    const query = querySequence(
      { rows: [{ prepare_settlement: null }] },
      { rows: [{ credits_charged: 17, balance_after: 83, replayed: false }] },
    );
    const meter = new PostgresUsageMeter({ query });
    const reservation = {
      id: reservationRow.reservation_id, ...identity, requestId: 'request-1', route: 'route',
      reservedCredits: 17, inputFingerprint: 'fingerprint-1',
    };
    const usage = {
      actualCredits: 17, httpStatus: 200, durationMs: 42,
      inputTokens: 10, outputTokens: 4, upstreamCostMicros: 3_000,
    };

    await meter.prepare(reservation, usage);
    await expect(meter.settle(reservation, usage)).resolves.toEqual({
      creditsCharged: 17, balanceAfter: 83, providerPriceOverrun: false,
    });
    expect(query.mock.calls[0]?.[0]).toContain('prepare_settlement');
    expect(query.mock.calls[0]?.[1]).toEqual([
      reservation.id, 17, 200, 42, 10, 4, 3_000, false,
    ]);
    expect(query.mock.calls[1]?.[0]).toContain('settle_usage');
  });

  it('reports a capped provider-price overrun from the reservation boundary', async () => {
    const query = querySequence({ rows: [{ credits_charged: 10, balance_after: 90, replayed: false }] });
    const meter = new PostgresUsageMeter({ query });
    const reservation = {
      id: reservationRow.reservation_id, ...identity, requestId: 'request-1', route: 'route',
      reservedCredits: 10, inputFingerprint: 'fingerprint-1',
    };
    await expect(meter.settle(reservation, {
      actualCredits: 12, httpStatus: 200, durationMs: 5,
    })).resolves.toEqual({ creditsCharged: 10, balanceAfter: 90, providerPriceOverrun: true });
  });

  it('releases with status/duration and returns the transactional balance', async () => {
    const query = querySequence({ rows: [{ balance_after: 100 }] });
    const meter = new PostgresUsageMeter({ query });
    const reservation = {
      id: reservationRow.reservation_id, ...identity, requestId: 'request-1', route: 'route',
      reservedCredits: 17, inputFingerprint: 'fingerprint-1',
    };
    await expect(meter.release(reservation, { httpStatus: 502, durationMs: 27 }))
      .resolves.toEqual({ balanceAfter: 100 });
    expect(query.mock.calls[0]?.[0]).toContain('release_reservation_with_balance');
    expect(query.mock.calls[0]?.[1]).toEqual([reservation.id, 502, 27]);
  });

  it('disables a route through the service-role control function', async () => {
    const query = querySequence({ rows: [] });
    const meter = new PostgresUsageMeter({ query });
    await meter.disableRoute('POST /v1/browser/pdf');
    expect(query.mock.calls[0]?.[0]).toContain('set_route_billing_enabled');
    expect(query.mock.calls[0]?.[1]).toEqual([
      'POST /v1/browser/pdf', false, 'provider_price_overrun',
    ]);
  });
});
