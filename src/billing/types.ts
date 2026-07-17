export interface CreditReservation {
  id: string;
  orgId: string;
  requestId: string;
  route: string;
  reservedCredits: number;
}

export type ReserveResult =
  | { ok: true; reservation: CreditReservation; availableCredits: number }
  | { ok: false; reason: 'unavailable' | 'insufficient_credits' | 'route_disabled' | 'billing_conflict'; availableCredits: number };

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
  reserve(orgId: string, requestId: string, route: string, credits: number): Promise<ReserveResult>;
  settle(reservation: CreditReservation, usage: SettlementUsage): Promise<SettlementResult>;
  release(reservation: CreditReservation): Promise<{ balanceAfter: number }>;
}
