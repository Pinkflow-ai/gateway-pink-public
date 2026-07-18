import type { FastifyReply, FastifyRequest } from 'fastify';
import type { RuntimeBrowserTimePricing, RuntimeFlatPricing, RuntimeMeteredPricing } from '../billing/pricing.js';
import { creditsForBrowserTime, creditsForProviderCost, directCostForBrowserTime } from '../billing/pricing.js';
import type { UsageMeter } from '../billing/types.js';
import type { BillingIdentity } from '../billing/types.js';
import type { BrowserMeteredProvider, MeteredProvider, Provider, ProviderContext, ProviderResult } from '../providers/_registry.js';
import { config } from '../config.js';
import { ERROR_STATUS, makeError, toUnexpectedError } from './errors.js';
import { policyFor } from '../policy/registry.js';
import { annotateAccess } from '../observability/access.js';
import { billingRequestId, idempotencyKeyFor, requestFingerprint } from './idempotency.js';

type IdentityForRequest = (request: FastifyRequest) => BillingIdentity;

function durationSince(startedAt: number): number {
  return Math.max(0, Date.now() - startedAt);
}

function headers(req: FastifyRequest, reply: FastifyReply, route: string): void {
  const policy = policyFor(route);
  if (policy) reply.header('X-Gateway-Storage-Policy', policy.storagePolicy);
  reply.header('X-Request-Id', req.id);
}

function context(req: FastifyRequest): ProviderContext {
  return { requestId: req.id, timeoutMs: config.upstreamTimeoutMs, userAgent: config.upstreamUserAgent };
}

function reserveFailure(
  reply: FastifyReply,
  req: FastifyRequest,
  result: Exclude<Awaited<ReturnType<UsageMeter['reserve']>>, { ok: true }>,
): void {
  reply.header('X-Credits-Remaining', String(result.availableCredits));
  if (result.reason === 'insufficient_credits') {
    reply.code(402).send(makeError('insufficient_credits', 'not enough credits for this call', req.id));
    return;
  }
  if (result.reason === 'billing_unknown') {
    reply.code(503).send(makeError('billing_unknown', 'settlement state is pending reconciliation', req.id));
    return;
  }
  if (result.reason === 'org_billing_disabled') {
    reply.code(403).send(makeError(
      'org_billing_disabled', 'paid access is not enabled for this organization', req.id,
    ));
    return;
  }
  if (result.reason === 'billing_debt') {
    reply.code(402).send(makeError(
      'billing_debt', 'organization billing requires resolution before paid calls', req.id,
    ));
    return;
  }
  if (['idempotency_mismatch', 'request_in_progress', 'request_already_settled', 'request_already_failed'].includes(result.reason)) {
    reply.code(409).send(makeError(result.reason, result.reason.replaceAll('_', ' '), req.id));
    return;
  }
  const code = result.reason === 'route_disabled' ? 'route_disabled' : 'billing_unavailable';
  reply.code(503).send(makeError(code, result.reason === 'route_disabled'
    ? 'route temporarily disabled after provider price overrun'
    : 'billing is not configured', req.id));
}

function billingIdentity(
  req: FastifyRequest,
  reply: FastifyReply,
  route: string,
  input: unknown,
  orgId: string,
): { requestId: string; fingerprint: string } | null {
  const key = idempotencyKeyFor(req);
  if (!key) {
    reply.code(400).send(makeError(
      'idempotency_key_required',
      'paid requests require Idempotency-Key matching [A-Za-z0-9._:-]{1,128}',
      req.id,
    ));
    return null;
  }
  return {
    requestId: billingRequestId(orgId, key),
    fingerprint: requestFingerprint(req.method, route, input),
  };
}

async function settleWithOneRetry(
  meter: UsageMeter,
  reservation: Parameters<UsageMeter['settle']>[0],
  usage: Parameters<UsageMeter['settle']>[1],
) {
  try {
    return await meter.settle(reservation, usage);
  } catch {
    return meter.settle(reservation, usage);
  }
}

async function executeProvider<Req, Res>(
  provider: Provider<Req, Res>, input: Req, req: FastifyRequest,
): Promise<ProviderResult<Res>> {
  return provider.execute(input, context(req));
}

export async function runFlatPaidProvider<Req, Res>(args: {
  req: FastifyRequest; reply: FastifyReply; route: string; provider: Provider<Req, Res>;
  input: Req; pricing: RuntimeFlatPricing; meter: UsageMeter; identityForRequest: IdentityForRequest;
}): Promise<void> {
  const { req, reply, route, provider, input, pricing, meter, identityForRequest } = args;
  const startedAt = Date.now();
  headers(req, reply, route);
  const principal = identityForRequest(req);
  const billing = billingIdentity(req, reply, route, input, principal.orgId);
  if (!billing) {
    annotateAccess(req, { provider: provider.id, billing_outcome: 'idempotency_key_required', error_code: 'idempotency_key_required' });
    return;
  }
  annotateAccess(req, { provider: provider.id, billing_outcome: 'reserving' });
  const reserved = await meter.reserve(principal, billing.requestId, route, pricing.credits, billing.fingerprint);
  if (!reserved.ok) { annotateAccess(req, { billing_outcome: reserved.reason }); reserveFailure(reply, req, reserved); return; }

  let result: ProviderResult<Res>;
  try {
    result = await executeProvider(provider, input, req);
  } catch (error) {
    try {
      const released = await meter.release(reserved.reservation, { httpStatus: 500, durationMs: durationSince(startedAt) });
      reply.header('X-Credits-Charged', '0').header('X-Credits-Remaining', String(released.balanceAfter));
      const envelope = toUnexpectedError(error, req.id);
      annotateAccess(req, { billing_outcome: 'released', error_code: envelope.error.code, credits: 0 });
      reply.code(500).send(envelope);
    } catch {
      annotateAccess(req, { billing_outcome: 'billing_unknown', error_code: 'billing_unknown' });
      reply.code(503).send(makeError('billing_unknown', 'reservation release requires reconciliation', req.id));
    }
    return;
  }

  if (!result.ok) {
    try {
      const status = ERROR_STATUS[result.error.code] ?? 502;
      const released = await meter.release(reserved.reservation, { httpStatus: status, durationMs: durationSince(startedAt) });
      reply.header('X-Credits-Charged', '0').header('X-Credits-Remaining', String(released.balanceAfter));
      annotateAccess(req, { billing_outcome: 'released', error_code: result.error.code, credits: 0 });
      reply.code(status).send(makeError(result.error.code, result.error.message, req.id));
    } catch {
      annotateAccess(req, { billing_outcome: 'billing_unknown', error_code: 'billing_unknown' });
      reply.code(503).send(makeError('billing_unknown', 'reservation release requires reconciliation', req.id));
    }
    return;
  }

  const usage = { actualCredits: pricing.credits, httpStatus: 200, durationMs: durationSince(startedAt) };
  let settlement;
  try {
    await meter.prepare(reserved.reservation, usage);
    settlement = await settleWithOneRetry(meter, reserved.reservation, usage);
  } catch {
    annotateAccess(req, { billing_outcome: 'billing_unknown', error_code: 'billing_unknown' });
    reply.code(503).send(makeError('billing_unknown', 'settlement requires reconciliation', req.id));
    return;
  }
  reply.header('X-Credits-Charged', String(settlement.creditsCharged));
  reply.header('X-Credits-Remaining', String(settlement.balanceAfter));
  annotateAccess(req, { billing_outcome: 'settled', credits: settlement.creditsCharged });
  reply.code(200).send({ data: result.data, _source: provider.source });
}

export async function runMeteredPaidProvider<Req, Res>(args: {
  req: FastifyRequest; reply: FastifyReply; route: string; provider: MeteredProvider<Req, Res>;
  input: Req; maxCredits: number; pricing: RuntimeMeteredPricing; meter: UsageMeter;
  identityForRequest: IdentityForRequest;
}): Promise<void> {
  const { req, reply, route, provider, input, maxCredits, pricing, meter, identityForRequest } = args;
  const startedAt = Date.now();
  headers(req, reply, route);
  const principal = identityForRequest(req);
  const billing = billingIdentity(req, reply, route, { input, maxCredits }, principal.orgId);
  if (!billing) {
    annotateAccess(req, { provider: provider.id, billing_outcome: 'idempotency_key_required', error_code: 'idempotency_key_required' });
    return;
  }
  annotateAccess(req, { provider: provider.id, billing_outcome: 'reserving' });
  const reserveCredits = Math.min(maxCredits, pricing.reserveCredits);
  const reserved = await meter.reserve(principal, billing.requestId, route, reserveCredits, billing.fingerprint);
  if (!reserved.ok) { annotateAccess(req, { billing_outcome: reserved.reason }); reserveFailure(reply, req, reserved); return; }

  let result: Awaited<ReturnType<MeteredProvider<Req, Res>['execute']>>;
  try {
    result = await provider.execute(input, context(req));
  } catch (error) {
    try {
      const released = await meter.release(reserved.reservation, { httpStatus: 500, durationMs: durationSince(startedAt) });
      reply.header('X-Credits-Charged', '0').header('X-Credits-Remaining', String(released.balanceAfter));
      const envelope = toUnexpectedError(error, req.id);
      annotateAccess(req, { billing_outcome: 'released', error_code: envelope.error.code, credits: 0 });
      reply.code(500).send(envelope);
    } catch {
      annotateAccess(req, { billing_outcome: 'billing_unknown', error_code: 'billing_unknown' });
      reply.code(503).send(makeError('billing_unknown', 'reservation release requires reconciliation', req.id));
    }
    return;
  }

  if (!result.ok) {
    try {
      const status = ERROR_STATUS[result.error.code] ?? 502;
      const released = await meter.release(reserved.reservation, { httpStatus: status, durationMs: durationSince(startedAt) });
      reply.header('X-Credits-Charged', '0').header('X-Credits-Remaining', String(released.balanceAfter));
      annotateAccess(req, { billing_outcome: 'released', error_code: result.error.code, credits: 0 });
      reply.code(status).send(makeError(result.error.code, result.error.message, req.id));
    } catch {
      annotateAccess(req, { billing_outcome: 'billing_unknown', error_code: 'billing_unknown' });
      reply.code(503).send(makeError('billing_unknown', 'reservation release requires reconciliation', req.id));
    }
    return;
  }

  const upstreamCostMicros = result.metering.providerCostMicros;
  const actualCredits = creditsForProviderCost(upstreamCostMicros, pricing);
  const usage = {
    actualCredits,
    httpStatus: 200,
    durationMs: durationSince(startedAt),
    inputTokens: result.metering.inputTokens,
    outputTokens: result.metering.outputTokens,
    upstreamCostMicros,
  };
  let settlement;
  try {
    await meter.prepare(reserved.reservation, usage);
    settlement = await settleWithOneRetry(meter, reserved.reservation, usage);
  } catch {
    annotateAccess(req, { billing_outcome: 'billing_unknown', error_code: 'billing_unknown' });
    reply.code(503).send(makeError('billing_unknown', 'settlement requires reconciliation', req.id));
    return;
  }
  reply.header('X-Credits-Charged', String(settlement.creditsCharged));
  reply.header('X-Credits-Remaining', String(settlement.balanceAfter));
  if (settlement.providerPriceOverrun) reply.header('X-Gateway-Price-Overrun', 'absorbed');
  annotateAccess(req, { billing_outcome: 'settled', credits: settlement.creditsCharged,
    input_tokens: result.metering.inputTokens, output_tokens: result.metering.outputTokens });
  reply.code(200).send({
    data: result.data,
    usage: {
      input_tokens: result.metering.inputTokens,
      output_tokens: result.metering.outputTokens,
      credits_charged: settlement.creditsCharged,
    },
    _source: provider.source,
  });
}

export async function runBrowserPaidProvider<Req, Res>(args: {
  req: FastifyRequest; reply: FastifyReply; route: string; provider: BrowserMeteredProvider<Req, Res>;
  input: Req; pricing: RuntimeBrowserTimePricing; meter: UsageMeter; identityForRequest: IdentityForRequest;
}): Promise<void> {
  const { req, reply, route, provider, input, pricing, meter, identityForRequest } = args;
  const startedAt = Date.now();
  headers(req, reply, route);
  const principal = identityForRequest(req);
  const billing = billingIdentity(req, reply, route, input, principal.orgId);
  if (!billing) {
    annotateAccess(req, { provider: provider.id, billing_outcome: 'idempotency_key_required', error_code: 'idempotency_key_required' });
    return;
  }
  annotateAccess(req, { provider: provider.id, billing_outcome: 'reserving' });
  const reserved = await meter.reserve(principal, billing.requestId, route, pricing.reserveCredits, billing.fingerprint);
  if (!reserved.ok) {
    annotateAccess(req, { billing_outcome: reserved.reason });
    reserveFailure(reply, req, reserved);
    return;
  }

  let result: Awaited<ReturnType<BrowserMeteredProvider<Req, Res>['execute']>>;
  try {
    result = await provider.execute(input, context(req));
  } catch (error) {
    try {
      const released = await meter.release(reserved.reservation, { httpStatus: 500, durationMs: durationSince(startedAt) });
      reply.header('X-Credits-Charged', '0').header('X-Credits-Remaining', String(released.balanceAfter));
      const envelope = toUnexpectedError(error, req.id);
      annotateAccess(req, { billing_outcome: 'released', error_code: envelope.error.code, credits: 0 });
      reply.code(500).send(envelope);
    } catch {
      annotateAccess(req, { billing_outcome: 'billing_unknown', error_code: 'billing_unknown' });
      reply.code(503).send(makeError('billing_unknown', 'reservation release requires reconciliation', req.id));
    }
    return;
  }

  if (!result.ok) {
    try {
      if (result.error.code === 'provider_price_overrun') await meter.disableRoute(route);
      const status = ERROR_STATUS[result.error.code] ?? 502;
      const released = await meter.release(reserved.reservation, { httpStatus: status, durationMs: durationSince(startedAt) });
      reply.header('X-Credits-Charged', '0').header('X-Credits-Remaining', String(released.balanceAfter));
      annotateAccess(req, { billing_outcome: 'released', error_code: result.error.code, credits: 0 });
      reply.code(status).send(makeError(result.error.code, result.error.message, req.id));
    } catch {
      annotateAccess(req, { billing_outcome: 'billing_unknown', error_code: 'billing_unknown' });
      reply.code(503).send(makeError('billing_unknown', 'reservation release requires reconciliation', req.id));
    }
    return;
  }

  const actualCredits = creditsForBrowserTime(result.metering.browserMs, pricing);
  const usage = {
    actualCredits,
    httpStatus: 200,
    durationMs: durationSince(startedAt),
    upstreamCostMicros: directCostForBrowserTime(result.metering.browserMs, pricing),
  };
  let settlement;
  try {
    await meter.prepare(reserved.reservation, usage);
    settlement = await settleWithOneRetry(meter, reserved.reservation, usage);
  } catch {
    annotateAccess(req, { billing_outcome: 'billing_unknown', error_code: 'billing_unknown' });
    reply.code(503).send(makeError('billing_unknown', 'settlement requires reconciliation', req.id));
    return;
  }
  reply.header('X-Credits-Charged', String(settlement.creditsCharged));
  reply.header('X-Credits-Remaining', String(settlement.balanceAfter));
  if (settlement.providerPriceOverrun) reply.header('X-Gateway-Price-Overrun', 'absorbed');
  annotateAccess(req, { billing_outcome: 'settled', credits: settlement.creditsCharged,
    browser_ms: result.metering.browserMs });
  reply.code(200).send({
    data: result.data,
    usage: { browser_ms: result.metering.browserMs, credits_charged: settlement.creditsCharged },
    _source: provider.source,
  });
}
