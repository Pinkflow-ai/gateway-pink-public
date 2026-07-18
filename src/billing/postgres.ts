import type { Queryable } from '../database/types.js';
import type {
  BillingIdentity,
  CreditReservation,
  ReleaseUsage,
  ReserveResult,
  SettlementResult,
  SettlementUsage,
  UsageMeter,
} from './types.js';

interface ReserveRow {
  reservation_id: string;
  reserved_credits: number;
  available_credits: number;
  reservation_state: string;
}

interface SettlementRow {
  credits_charged: number;
  balance_after: number;
  replayed: boolean;
}

const KNOWN_RESERVE_FAILURES = new Set<Exclude<ReserveResult, { ok: true }>['reason']>([
  'idempotency_mismatch',
  'request_in_progress',
  'billing_unknown',
  'request_already_settled',
  'request_already_failed',
  'route_disabled',
  'org_billing_disabled',
  'billing_debt',
]);

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function reserveFailure(error: unknown): Exclude<ReserveResult, { ok: true }> {
  const message = errorMessage(error);
  for (const reason of KNOWN_RESERVE_FAILURES) {
    if (message.includes(reason)) return { ok: false, reason, availableCredits: 0 };
  }
  if (message.includes('insufficient_credits')) {
    const available = message.match(/available\s+(-?\d+)/i)?.[1];
    return {
      ok: false,
      reason: 'insufficient_credits',
      availableCredits: Math.max(0, Number.parseInt(available ?? '0', 10) || 0),
    };
  }
  return { ok: false, reason: 'unavailable', availableCredits: 0 };
}

function oneRow<Row>(rows: Row[], operation: string): Row {
  if (rows.length !== 1) throw new Error(`${operation} returned an invalid result`);
  return rows[0];
}

export class PostgresUsageMeter implements UsageMeter {
  constructor(private readonly database: Queryable) {}

  async reserve(
    identity: BillingIdentity,
    requestId: string,
    route: string,
    credits: number,
    inputFingerprint: string,
  ): Promise<ReserveResult> {
    try {
      const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
      const result = await this.database.query<ReserveRow>(
        `select * from reserve_credits(
          $1::uuid, $2::uuid, $3::text, $4::text, $5::integer, $6::text, $7::timestamptz
        )`,
        [identity.orgId, identity.apiKeyId, route, requestId, credits, inputFingerprint, expiresAt],
      );
      const row = oneRow(result.rows, 'reserve_credits');
      if (row.reservation_state !== 'active') {
        return { ok: false, reason: 'billing_unknown', availableCredits: row.available_credits };
      }
      const reservation: CreditReservation = {
        id: row.reservation_id,
        ...identity,
        requestId,
        route,
        reservedCredits: row.reserved_credits,
        inputFingerprint,
      };
      return { ok: true, reservation, availableCredits: row.available_credits };
    } catch (error) {
      return reserveFailure(error);
    }
  }

  async prepare(reservation: CreditReservation, usage: SettlementUsage): Promise<void> {
    const overrun = usage.actualCredits > reservation.reservedCredits;
    await this.database.query(
      `select prepare_settlement(
        $1::uuid, $2::integer, $3::integer, $4::integer,
        $5::bigint, $6::bigint, $7::bigint, $8::boolean
      )`,
      [
        reservation.id,
        usage.actualCredits,
        usage.httpStatus,
        usage.durationMs,
        usage.inputTokens ?? 0,
        usage.outputTokens ?? 0,
        usage.upstreamCostMicros ?? 0,
        overrun,
      ],
    );
  }

  async settle(reservation: CreditReservation, usage: SettlementUsage): Promise<SettlementResult> {
    const result = await this.database.query<SettlementRow>(
      'select * from settle_usage($1::uuid)',
      [reservation.id],
    );
    const row = oneRow(result.rows, 'settle_usage');
    return {
      creditsCharged: row.credits_charged,
      balanceAfter: row.balance_after,
      providerPriceOverrun: usage.actualCredits > reservation.reservedCredits,
    };
  }

  async release(reservation: CreditReservation, usage: ReleaseUsage): Promise<{ balanceAfter: number }> {
    const result = await this.database.query<{ balance_after: number }>(
      'select release_reservation_with_balance($1::uuid, $2::integer, $3::integer) as balance_after',
      [reservation.id, usage.httpStatus, usage.durationMs],
    );
    const row = oneRow(result.rows, 'release_reservation_with_balance');
    return { balanceAfter: row.balance_after };
  }

  async disableRoute(route: string): Promise<void> {
    await this.database.query(
      'select set_route_billing_enabled($1::text, $2::boolean, $3::text)',
      [route, false, 'provider_price_overrun'],
    );
  }
}
