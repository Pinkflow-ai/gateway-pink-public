export type PaddleAdjustmentAction = 'credit' | 'refund' | 'chargeback' | 'chargeback_warning';
export type PaddleReversalAction = 'credit_reverse' | 'chargeback_reverse' | 'chargeback_warning_reverse';

export interface PaddlePurchaseRecord {
  orgId: string;
  transactionId: string;
  packId: string;
  priceId: string;
  credits: number;
  grossCents: number;
  currency: string;
  reversedCredits: number;
}

export interface PaddleCheckoutIntent {
  orgId: string;
  transactionId: string;
  packId: string;
  priceId: string;
  credits: number;
  grossCents: number;
  currency: string;
}

export interface FulfillPurchaseInput {
  eventId: string;
  eventType: string;
  payloadHash: string;
  transactionId: string;
  orgId: string;
  packId: string;
  priceId: string;
  credits: number;
  grossCents: number;
  currency: string;
}

export interface ApplyAdjustmentInput {
  eventId: string;
  eventType: string;
  payloadHash: string;
  adjustmentId: string;
  transactionId: string;
  action: PaddleAdjustmentAction;
  credits: number;
}

export interface ReverseAdjustmentInput {
  eventId: string;
  eventType: string;
  payloadHash: string;
  adjustmentId: string;
  originalAdjustmentId: string;
  action: PaddleReversalAction;
}

export interface PaddleMutationResult {
  balanceAfter: number;
  debtAfter: number;
  duplicate: boolean;
}

export interface PaddleBillingStore {
  recordCheckoutIntent(intent: PaddleCheckoutIntent): Promise<void>;
  checkoutIntentForTransaction(transactionId: string): Promise<PaddleCheckoutIntent | null>;
  purchaseForTransaction(transactionId: string): Promise<PaddlePurchaseRecord | null>;
  fulfill(input: FulfillPurchaseInput): Promise<PaddleMutationResult>;
  applyAdjustment(input: ApplyAdjustmentInput): Promise<PaddleMutationResult>;
  reverseAdjustment(input: ReverseAdjustmentInput): Promise<PaddleMutationResult>;
  findOriginalAdjustment(
    transactionId: string,
    action: PaddleReversalAction,
    credits: number,
  ): Promise<string | null>;
}
