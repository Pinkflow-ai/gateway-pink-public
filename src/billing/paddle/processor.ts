import type { PaddleCatalog } from './catalog.js';
import { creditsForAdjustment } from './catalog.js';
import type {
  PaddleAdjustmentAction,
  PaddleBillingStore,
  PaddleReversalAction,
} from './store.js';

export interface PaddleProcessResult {
  handled: boolean;
  duplicate?: boolean;
}

type JsonObject = Record<string, unknown>;

const ADJUSTMENTS = new Set<PaddleAdjustmentAction>([
  'credit', 'refund', 'chargeback', 'chargeback_warning',
]);
const REVERSALS = new Set<PaddleReversalAction>([
  'credit_reverse', 'chargeback_reverse', 'chargeback_warning_reverse',
]);

function object(value: unknown, name: string): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`invalid Paddle ${name}`);
  }
  return value as JsonObject;
}

function text(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`invalid Paddle ${name}`);
  return value;
}

function cents(value: unknown, name: string): number {
  if (typeof value !== 'string' || !/^-?\d+$/.test(value)) throw new Error(`invalid Paddle ${name}`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error(`invalid Paddle ${name}`);
  return parsed;
}

function decode(rawBody: Buffer): JsonObject {
  try {
    return object(JSON.parse(rawBody.toString('utf8')), 'event');
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('invalid Paddle')) throw error;
    throw new Error('invalid Paddle event JSON');
  }
}

export class PaddleWebhookProcessor {
  constructor(
    private readonly catalog: PaddleCatalog,
    private readonly store: PaddleBillingStore,
  ) {}

  async process(rawBody: Buffer, payloadHash: string): Promise<PaddleProcessResult> {
    const event = decode(rawBody);
    const eventType = text(event.event_type, 'event type');
    if (eventType === 'transaction.completed') {
      return this.transaction(event, eventType, payloadHash);
    }
    if (eventType === 'adjustment.created' || eventType === 'adjustment.updated') {
      return this.adjustment(event, eventType, payloadHash);
    }
    return { handled: false };
  }

  private async transaction(
    event: JsonObject,
    eventType: string,
    payloadHash: string,
  ): Promise<PaddleProcessResult> {
    const eventId = text(event.event_id, 'event id');
    const data = object(event.data, 'transaction');
    const transactionId = text(data.id, 'transaction id');
    if (data.status !== 'completed') throw new Error('invalid Paddle transaction status');
    if (!Array.isArray(data.items) || data.items.length !== 1) {
      throw new Error('Paddle transaction pack mismatch');
    }
    const item = object(data.items[0], 'transaction item');
    if (item.quantity !== 1) throw new Error('Paddle transaction pack mismatch');
    const priceId = text(object(item.price, 'transaction price').id, 'price id');
    const pack = this.catalog.byPriceId(priceId);
    if (!pack) throw new Error('Paddle transaction pack mismatch');

    const intent = await this.store.checkoutIntentForTransaction(transactionId);
    if (!intent) throw new Error('Paddle checkout intent not found');
    if (intent.orgId.length === 0) throw new Error('Paddle transaction organization mismatch');
    if (intent.packId !== pack.packId || intent.priceId !== pack.priceId
      || intent.credits !== pack.credits || intent.grossCents !== pack.subtotalCents) {
      throw new Error('Paddle transaction pack mismatch');
    }
    if (data.currency_code !== intent.currency || data.currency_code !== pack.currency) {
      throw new Error('Paddle transaction currency mismatch');
    }
    const totals = object(object(data.details, 'transaction details').totals, 'transaction totals');
    if (cents(totals.subtotal, 'transaction subtotal') !== pack.subtotalCents) {
      throw new Error('Paddle transaction subtotal mismatch');
    }
    if (cents(totals.discount, 'transaction discount') !== 0) {
      throw new Error('Paddle transaction discount mismatch');
    }
    const custom = object(data.custom_data, 'transaction custom data');
    if (custom.gateway_org_id !== intent.orgId) {
      throw new Error('Paddle transaction organization mismatch');
    }
    if (custom.gateway_pack_id !== pack.packId) throw new Error('Paddle transaction pack mismatch');
    if (custom.gateway_pricing_version !== pack.pricingVersion) {
      throw new Error('Paddle transaction pricing version mismatch');
    }

    const result = await this.store.fulfill({
      eventId,
      eventType,
      payloadHash,
      transactionId,
      orgId: intent.orgId,
      packId: pack.packId,
      priceId: pack.priceId,
      credits: pack.credits,
      grossCents: pack.subtotalCents,
      currency: pack.currency,
    });
    return { handled: true, duplicate: result.duplicate };
  }

  private async adjustment(
    event: JsonObject,
    eventType: string,
    payloadHash: string,
  ): Promise<PaddleProcessResult> {
    const eventId = text(event.event_id, 'event id');
    const data = object(event.data, 'adjustment');
    if (data.status !== 'approved') return { handled: false };
    const actionText = text(data.action, 'adjustment action');
    if (!ADJUSTMENTS.has(actionText as PaddleAdjustmentAction)
      && !REVERSALS.has(actionText as PaddleReversalAction)) return { handled: false };
    const action = actionText as PaddleAdjustmentAction | PaddleReversalAction;
    const adjustmentId = text(data.id, 'adjustment id');
    const transactionId = text(data.transaction_id, 'adjustment transaction id');
    const purchase = await this.store.purchaseForTransaction(transactionId);
    if (!purchase) throw new Error('Paddle purchase not found for adjustment');
    const pack = this.catalog.byPackId(purchase.packId);
    if (!pack || purchase.priceId !== pack.priceId || purchase.credits !== pack.credits
      || purchase.grossCents !== pack.subtotalCents) {
      throw new Error('Paddle adjustment purchase mismatch');
    }
    if (data.currency_code !== purchase.currency || data.currency_code !== pack.currency) {
      throw new Error('Paddle adjustment currency mismatch');
    }
    const subtotalCents = Math.abs(cents(
      object(data.totals, 'adjustment totals').subtotal,
      'adjustment subtotal',
    ));
    if (subtotalCents === 0) return { handled: false };
    if (subtotalCents > pack.subtotalCents) throw new Error('Paddle adjustment subtotal exceeds purchase');
    const credits = creditsForAdjustment(pack, subtotalCents);

    if (REVERSALS.has(action as PaddleReversalAction)) {
      const reversalAction = action as PaddleReversalAction;
      const originalAdjustmentId = await this.store.findOriginalAdjustment(
        transactionId,
        reversalAction,
        credits,
      );
      if (!originalAdjustmentId) throw new Error('Paddle original adjustment not found');
      const result = await this.store.reverseAdjustment({
        eventId,
        eventType,
        payloadHash,
        adjustmentId,
        originalAdjustmentId,
        action: reversalAction,
      });
      return { handled: true, duplicate: result.duplicate };
    }

    const result = await this.store.applyAdjustment({
      eventId,
      eventType,
      payloadHash,
      adjustmentId,
      transactionId,
      action: action as PaddleAdjustmentAction,
      credits,
    });
    return { handled: true, duplicate: result.duplicate };
  }
}
