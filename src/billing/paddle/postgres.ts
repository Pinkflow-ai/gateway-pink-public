import type { Queryable } from '../../database/types.js';
import type {
  ApplyAdjustmentInput,
  FulfillPurchaseInput,
  PaddleBillingStore,
  PaddleCheckoutIntent,
  PaddleMutationResult,
  PaddlePurchaseRecord,
  PaddleReversalAction,
  ReverseAdjustmentInput,
} from './store.js';

interface PurchaseRow {
  org_id: string;
  transaction_id: string;
  pack_id: string;
  price_id: string;
  credits: number;
  gross_cents: number;
  currency: string;
  reversed_credits: number;
}

interface MutationRow {
  balance_after: number;
  debt_after: number;
  duplicate: boolean;
}

function mutation(rows: MutationRow[], operation: string): PaddleMutationResult {
  if (rows.length !== 1) throw new Error(`${operation} returned an invalid result`);
  return {
    balanceAfter: rows[0]!.balance_after,
    debtAfter: rows[0]!.debt_after,
    duplicate: rows[0]!.duplicate,
  };
}

export class PostgresPaddleBillingStore implements PaddleBillingStore {
  constructor(private readonly database: Queryable) {}

  async recordCheckoutIntent(intent: PaddleCheckoutIntent): Promise<void> {
    await this.database.query(
      `insert into billing_checkout_intents (
        transaction_id, org_id, pack_id, price_id, credits, gross_cents, currency
      ) values ($1::text, $2::uuid, $3::text, $4::text, $5::integer, $6::integer, $7::text)`,
      [
        intent.transactionId, intent.orgId, intent.packId, intent.priceId,
        intent.credits, intent.grossCents, intent.currency,
      ],
    );
  }

  async checkoutIntentForTransaction(transactionId: string): Promise<PaddleCheckoutIntent | null> {
    const result = await this.database.query<Omit<PurchaseRow, 'reversed_credits'>>(
      `select org_id, transaction_id, pack_id, price_id, credits, gross_cents, currency
       from billing_checkout_intents where transaction_id = $1::text`,
      [transactionId],
    );
    if (result.rows.length === 0) return null;
    if (result.rows.length !== 1) throw new Error('checkout intent lookup returned an invalid result');
    const row = result.rows[0]!;
    return {
      orgId: row.org_id,
      transactionId: row.transaction_id,
      packId: row.pack_id,
      priceId: row.price_id,
      credits: row.credits,
      grossCents: row.gross_cents,
      currency: row.currency,
    };
  }

  async purchaseForTransaction(transactionId: string): Promise<PaddlePurchaseRecord | null> {
    const result = await this.database.query<PurchaseRow>(
      `select org_id, transaction_id, pack_id, price_id, credits,
        gross_cents, currency, reversed_credits
       from billing_purchases where transaction_id = $1::text`,
      [transactionId],
    );
    if (result.rows.length === 0) return null;
    if (result.rows.length !== 1) throw new Error('purchase lookup returned an invalid result');
    const row = result.rows[0]!;
    return {
      orgId: row.org_id,
      transactionId: row.transaction_id,
      packId: row.pack_id,
      priceId: row.price_id,
      credits: row.credits,
      grossCents: row.gross_cents,
      currency: row.currency,
      reversedCredits: row.reversed_credits,
    };
  }

  async fulfill(input: FulfillPurchaseInput): Promise<PaddleMutationResult> {
    const result = await this.database.query<MutationRow>(
      `select * from fulfill_paddle_purchase(
        $1::text, $2::text, $3::text, $4::text, $5::uuid,
        $6::text, $7::text, $8::integer, $9::integer, $10::text
      )`,
      [
        input.eventId, input.eventType, input.payloadHash, input.transactionId, input.orgId,
        input.packId, input.priceId, input.credits, input.grossCents, input.currency,
      ],
    );
    return mutation(result.rows, 'fulfill_paddle_purchase');
  }

  async applyAdjustment(input: ApplyAdjustmentInput): Promise<PaddleMutationResult> {
    const result = await this.database.query<MutationRow>(
      `select * from apply_paddle_adjustment(
        $1::text, $2::text, $3::text, $4::text, $5::text, $6::text, $7::integer
      )`,
      [
        input.eventId, input.eventType, input.payloadHash, input.adjustmentId,
        input.transactionId, input.action, input.credits,
      ],
    );
    return mutation(result.rows, 'apply_paddle_adjustment');
  }

  async reverseAdjustment(input: ReverseAdjustmentInput): Promise<PaddleMutationResult> {
    const result = await this.database.query<MutationRow>(
      `select * from reverse_paddle_adjustment(
        $1::text, $2::text, $3::text, $4::text, $5::text, $6::text
      )`,
      [
        input.eventId, input.eventType, input.payloadHash, input.adjustmentId,
        input.originalAdjustmentId, input.action,
      ],
    );
    return mutation(result.rows, 'reverse_paddle_adjustment');
  }

  async findOriginalAdjustment(
    transactionId: string,
    action: PaddleReversalAction,
    credits: number,
  ): Promise<string | null> {
    const originalAction = {
      credit_reverse: 'credit',
      chargeback_reverse: 'chargeback',
      chargeback_warning_reverse: 'chargeback_warning',
    }[action];
    const result = await this.database.query<{ adjustment_id: string }>(
      `select adjustment.adjustment_id
       from billing_adjustments adjustment
       join billing_purchases purchase on purchase.id = adjustment.purchase_id
       where purchase.transaction_id = $1::text
         and adjustment.action = $2::text
         and adjustment.credits = $3::integer
         and adjustment.reversed_at is null
       order by adjustment.created_at desc
       limit 1`,
      [transactionId, originalAction, credits],
    );
    return result.rows[0]?.adjustment_id ?? null;
  }
}
