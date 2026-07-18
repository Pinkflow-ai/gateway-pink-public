export interface BillingIdentity {
  orgId: string;
  apiKeyId: string;
}

export interface CreditReservation {
  id: string;
  orgId: string;
  apiKeyId: string;
  requestId: string;
  route: string;
  reservedCredits: number;
  inputFingerprint: string;
}

export type ReserveResult =
  | { ok: true; reservation: CreditReservation; availableCredits: number }
  | { ok: false; reason: 'unavailable' | 'insufficient_credits' | 'route_disabled'
    | 'idempotency_mismatch' | 'request_in_progress' | 'request_already_settled'
    | 'request_already_failed' | 'billing_unknown' | 'org_billing_disabled'
    | 'billing_debt'; availableCredits: number };

export interface SettlementUsage {
  actualCredits: number;
  httpStatus: number;
  durationMs: number;
  inputTokens?: number;
  outputTokens?: number;
  upstreamCostMicros?: number;
}

export interface ReleaseUsage {
  httpStatus: number;
  durationMs: number;
}

export interface SettlementResult {
  creditsCharged: number;
  balanceAfter: number;
  providerPriceOverrun: boolean;
}

export interface UsageMeter {
  reserve(identity: BillingIdentity, requestId: string, route: string, credits: number, inputFingerprint: string): Promise<ReserveResult>;
  prepare(reservation: CreditReservation, usage: SettlementUsage): Promise<void>;
  settle(reservation: CreditReservation, usage: SettlementUsage): Promise<SettlementResult>;
  release(reservation: CreditReservation, usage: ReleaseUsage): Promise<{ balanceAfter: number }>;
  disableRoute(route: string): Promise<void>;
}
