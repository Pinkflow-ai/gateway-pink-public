import { randomUUID } from 'node:crypto';
import type {
  CreditReservation,
  ReserveResult,
  SettlementResult,
  SettlementUsage,
  UsageMeter,
} from './types.js';

interface ActiveReservation extends CreditReservation {
  state: 'active' | 'settled' | 'released';
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
      .filter((item) => item.orgId === orgId && item.state === 'active')
      .reduce((sum, item) => sum + item.reservedCredits, 0);
    return this.balance - holds;
  }

  async reserve(orgId: string, requestId: string, route: string, credits: number): Promise<ReserveResult> {
    if (!Number.isSafeInteger(credits) || credits <= 0) throw new RangeError('reserved credits must be positive');
    const availableCredits = this.availableCredits(orgId);
    if (this.disabledRoutes.has(route)) return { ok: false, reason: 'route_disabled', availableCredits };

    const previousId = this.reservationByRequest.get(requestId);
    if (previousId) {
      const previous = this.reservations.get(previousId)!;
      if (previous.orgId !== orgId || previous.route !== route
        || previous.reservedCredits !== credits || previous.state !== 'active') {
        return { ok: false, reason: 'billing_conflict', availableCredits };
      }
      return { ok: true, reservation: previous, availableCredits };
    }

    if (availableCredits < credits) {
      return { ok: false, reason: 'insufficient_credits', availableCredits };
    }
    const reservation: ActiveReservation = {
      id: randomUUID(), orgId, requestId, route, reservedCredits: credits, state: 'active',
    };
    this.reservations.set(reservation.id, reservation);
    this.reservationByRequest.set(requestId, reservation.id);
    return { ok: true, reservation, availableCredits: availableCredits - credits };
  }

  async settle(reservation: CreditReservation, usage: SettlementUsage): Promise<SettlementResult> {
    const active = this.reservations.get(reservation.id);
    if (!active || active.state !== 'active') throw new Error('reservation is not active');
    if (!Number.isSafeInteger(usage.actualCredits) || usage.actualCredits < 0) {
      throw new RangeError('actual credits must be a non-negative integer');
    }
    const providerPriceOverrun = usage.actualCredits > active.reservedCredits;
    const creditsCharged = Math.min(usage.actualCredits, active.reservedCredits);
    this.balance -= creditsCharged;
    active.state = 'settled';
    if (providerPriceOverrun) this.disabledRoutes.add(active.route);
    return { creditsCharged, balanceAfter: this.balance, providerPriceOverrun };
  }

  async release(reservation: CreditReservation): Promise<{ balanceAfter: number }> {
    const active = this.reservations.get(reservation.id);
    if (active?.state === 'active') active.state = 'released';
    return { balanceAfter: this.balance };
  }
}
