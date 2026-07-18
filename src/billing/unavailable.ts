import type { CreditReservation, ReserveResult, SettlementResult, SettlementUsage, UsageMeter } from './types.js';

export class UnavailableUsageMeter implements UsageMeter {
  async reserve(): Promise<ReserveResult> {
    return { ok: false, reason: 'unavailable', availableCredits: 0 };
  }
  async prepare(_reservation: CreditReservation, _usage: SettlementUsage): Promise<void> {
    throw new Error('billing is unavailable');
  }
  async settle(_reservation: CreditReservation, _usage: SettlementUsage): Promise<SettlementResult> {
    throw new Error('billing is unavailable');
  }
  async release(): Promise<{ balanceAfter: number }> {
    return { balanceAfter: 0 };
  }
  async disableRoute(): Promise<void> {
    throw new Error('billing is unavailable');
  }
}
