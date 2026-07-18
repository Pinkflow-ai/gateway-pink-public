import { randomUUID } from 'node:crypto';
import type {
  CreditReservation,
  ReserveResult,
  SettlementResult,
  SettlementUsage,
  UsageMeter,
} from './types.js';

interface ActiveReservation extends CreditReservation {
  state: 'active' | 'settlement_pending' | 'settled' | 'released';
  pendingUsage?: SettlementUsage;
  settlementResult?: SettlementResult;
}

/**
 * Process-local development meter. Production uses the Postgres reservation
 * functions from the private gateway; this implementation keeps local paid
 * route behavior safe and testable without pretending to be durable.
 */
export class MemoryUsageMeter implements UsageMeter {
  private balance: number;
  private readonly reservations = new Map<string, ActiveReservation>();
  private readonly reservationByRequest = new Map<string, string>();
  private readonly disabledRoutes = new Set<string>();

  constructor(initialBalance: number) {
    if (!Number.isSafeInteger(initialBalance) || initialBalance < 0) {
      throw new RangeError('initial balance must be a non-negative integer');
    }
    this.balance = initialBalance;
  }

  private availableCredits(orgId: string): number {
    const holds = [...this.reservations.values()]
      .filter((item) => item.orgId === orgId && (item.state === 'active' || item.state === 'settlement_pending'))
      .reduce((sum, item) => sum + item.reservedCredits, 0);
    return this.balance - holds;
  }

  async reserve(orgId: string, requestId: string, route: string, credits: number, inputFingerprint: string): Promise<ReserveResult> {
    if (!Number.isSafeInteger(credits) || credits <= 0) throw new RangeError('reserved credits must be positive');
    const availableCredits = this.availableCredits(orgId);
    const previousId = this.reservationByRequest.get(requestId);
    if (previousId) {
      const previous = this.reservations.get(previousId)!;
      if (previous.orgId !== orgId || previous.route !== route
        || previous.reservedCredits !== credits || previous.inputFingerprint !== inputFingerprint) {
        return { ok: false, reason: 'idempotency_mismatch', availableCredits };
      }
      const reason = previous.state === 'active' ? 'request_in_progress'
        : previous.state === 'settlement_pending' ? 'billing_unknown'
        : previous.state === 'settled' ? 'request_already_settled'
        : 'request_already_failed';
      return { ok: false, reason, availableCredits };
    }

    if (this.disabledRoutes.has(route)) return { ok: false, reason: 'route_disabled', availableCredits };

    if (availableCredits < credits) {
      return { ok: false, reason: 'insufficient_credits', availableCredits };
    }
    const reservation: ActiveReservation = {
      id: randomUUID(), orgId, requestId, route, reservedCredits: credits, inputFingerprint, state: 'active',
    };
    this.reservations.set(reservation.id, reservation);
    this.reservationByRequest.set(requestId, reservation.id);
    return { ok: true, reservation, availableCredits: availableCredits - credits };
  }

  async prepare(reservation: CreditReservation, usage: SettlementUsage): Promise<void> {
    const active = this.reservations.get(reservation.id);
    if (!active) throw new Error('reservation not found');
    if (active.state === 'settlement_pending') return;
    if (active.state !== 'active') throw new Error('reservation is not active');
    active.pendingUsage = { ...usage };
    active.state = 'settlement_pending';
  }

  async settle(reservation: CreditReservation, usage: SettlementUsage): Promise<SettlementResult> {
    const active = this.reservations.get(reservation.id);
    if (active?.state === 'settled' && active.settlementResult) return active.settlementResult;
    if (!active || active.state !== 'settlement_pending') throw new Error('reservation is not pending settlement');
    if (!Number.isSafeInteger(usage.actualCredits) || usage.actualCredits < 0) {
      throw new RangeError('actual credits must be a non-negative integer');
    }
    const providerPriceOverrun = usage.actualCredits > active.reservedCredits;
    const creditsCharged = Math.min(usage.actualCredits, active.reservedCredits);
    this.balance -= creditsCharged;
    active.state = 'settled';
    if (providerPriceOverrun) this.disabledRoutes.add(active.route);
    active.settlementResult = { creditsCharged, balanceAfter: this.balance, providerPriceOverrun };
    return active.settlementResult;
  }

  async release(reservation: CreditReservation): Promise<{ balanceAfter: number }> {
    const active = this.reservations.get(reservation.id);
    if (active?.state === 'active') active.state = 'released';
    return { balanceAfter: this.balance };
  }

  async disableRoute(route: string): Promise<void> {
    this.disabledRoutes.add(route);
  }
}
