import type { CreditReservation, ReserveResult, SettlementResult, SettlementUsage, UsageMeter } from './types.js';

export class UnavailableUsageMeter implements UsageMeter {
  async reserve(): Promise<ReserveResult> {
    return { ok: false, reason: 'unavailable', availableCredits: 0 };
  }
  async settle(_reservation: CreditReservation, _usage: SettlementUsage): Promise<SettlementResult> {
    throw new Error('billing is unavailable');
  }
  async release(): Promise<{ balanceAfter: number }> {
    return { balanceAfter: 0 };
  }
}
