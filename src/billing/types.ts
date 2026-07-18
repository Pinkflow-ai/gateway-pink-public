export interface CreditReservation {
  id: string;
  orgId: string;
  requestId: string;
  route: string;
  reservedCredits: number;
  inputFingerprint: string;
}

export type ReserveResult =
  | { ok: true; reservation: CreditReservation; availableCredits: number }
  | { ok: false; reason: 'unavailable' | 'insufficient_credits' | 'route_disabled'
    | 'idempotency_mismatch' | 'request_in_progress' | 'request_already_settled'
    | 'request_already_failed' | 'billing_unknown'; availableCredits: number };

export interface SettlementUsage {
  actualCredits: number;
  inputTokens?: number;
  outputTokens?: number;
  upstreamCostMicros?: number;
}

export interface SettlementResult {
  creditsCharged: number;
  balanceAfter: number;
  providerPriceOverrun: boolean;
}

export interface UsageMeter {
  reserve(orgId: string, requestId: string, route: string, credits: number, inputFingerprint: string): Promise<ReserveResult>;
  prepare(reservation: CreditReservation, usage: SettlementUsage): Promise<void>;
  settle(reservation: CreditReservation, usage: SettlementUsage): Promise<SettlementResult>;
  release(reservation: CreditReservation): Promise<{ balanceAfter: number }>;
  disableRoute(route: string): Promise<void>;
}
