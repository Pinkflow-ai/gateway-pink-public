import type { FastifyReply, FastifyRequest } from 'fastify';
import type { RuntimeFlatPricing, RuntimeMeteredPricing } from '../billing/pricing.js';
import { creditsForProviderCost } from '../billing/pricing.js';
import type { UsageMeter } from '../billing/types.js';
import type { MeteredProvider, Provider, ProviderContext, ProviderResult } from '../providers/_registry.js';
import { config } from '../config.js';
import { ERROR_STATUS, makeError, toUnexpectedError } from './errors.js';
import { requestLogger } from '../log.js';
import { policyFor } from '../policy/registry.js';

type OrgIdForRequest = (request: FastifyRequest) => string;

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
  if (result.reason === 'billing_conflict') {
    reply.code(409).send(makeError('billing_conflict', 'request id is already finalized or conflicts', req.id));
    return;
  }
  const code = result.reason === 'route_disabled' ? 'route_disabled' : 'billing_unavailable';
  reply.code(503).send(makeError(code, result.reason === 'route_disabled'
    ? 'route temporarily disabled after provider price overrun'
    : 'billing is not configured', req.id));
}

async function executeProvider<Req, Res>(
  provider: Provider<Req, Res>, input: Req, req: FastifyRequest,
): Promise<ProviderResult<Res>> {
  return provider.execute(input, context(req));
}

export async function runFlatPaidProvider<Req, Res>(args: {
  req: FastifyRequest; reply: FastifyReply; route: string; provider: Provider<Req, Res>;
  input: Req; pricing: RuntimeFlatPricing; meter: UsageMeter; orgIdForRequest: OrgIdForRequest;
}): Promise<void> {
  const { req, reply, route, provider, input, pricing, meter, orgIdForRequest } = args;
  const started = Date.now();
  const log = requestLogger(req.id);
  headers(req, reply, route);
  const reserved = await meter.reserve(orgIdForRequest(req), req.id, route, pricing.credits);
  if (!reserved.ok) { reserveFailure(reply, req, reserved); return; }
  try {
    const result = await executeProvider(provider, input, req);
    if (!result.ok) {
      const released = await meter.release(reserved.reservation);
      reply.header('X-Credits-Charged', '0').header('X-Credits-Remaining', String(released.balanceAfter));
      const status = ERROR_STATUS[result.error.code] ?? 502;
      log.warn({ endpoint: route, status, latency_ms: Date.now() - started, err: result.error.code });
      reply.code(status).send(makeError(result.error.code, result.error.message, req.id));
      return;
    }
    const settlement = await meter.settle(reserved.reservation, { actualCredits: pricing.credits });
    reply.header('X-Credits-Charged', String(settlement.creditsCharged));
    reply.header('X-Credits-Remaining', String(settlement.balanceAfter));
    log.info({ endpoint: route, status: 200, latency_ms: Date.now() - started, credits: settlement.creditsCharged });
    reply.code(200).send({ data: result.data, _source: provider.source });
  } catch (error) {
    await meter.release(reserved.reservation);
    reply.header('X-Credits-Charged', '0');
    const envelope = toUnexpectedError(error, req.id);
    log.error({ endpoint: route, status: 500, latency_ms: Date.now() - started, err: envelope.error.code });
    reply.code(500).send(envelope);
  }
}

export async function runMeteredPaidProvider<Req, Res>(args: {
  req: FastifyRequest; reply: FastifyReply; route: string; provider: MeteredProvider<Req, Res>;
  input: Req; maxCredits: number; pricing: RuntimeMeteredPricing; meter: UsageMeter;
  orgIdForRequest: OrgIdForRequest;
}): Promise<void> {
  const { req, reply, route, provider, input, maxCredits, pricing, meter, orgIdForRequest } = args;
  const started = Date.now();
  const log = requestLogger(req.id);
  headers(req, reply, route);
  const reserveCredits = Math.min(maxCredits, pricing.reserveCredits);
  const reserved = await meter.reserve(orgIdForRequest(req), req.id, route, reserveCredits);
  if (!reserved.ok) { reserveFailure(reply, req, reserved); return; }
  try {
    const result = await provider.execute(input, context(req));
    if (!result.ok) {
      const released = await meter.release(reserved.reservation);
      reply.header('X-Credits-Charged', '0').header('X-Credits-Remaining', String(released.balanceAfter));
      const status = ERROR_STATUS[result.error.code] ?? 502;
      reply.code(status).send(makeError(result.error.code, result.error.message, req.id));
      return;
    }
    const upstreamCostMicros = result.metering.providerCostMicros;
    const actualCredits = creditsForProviderCost(upstreamCostMicros, pricing);
    const settlement = await meter.settle(reserved.reservation, {
      actualCredits,
      inputTokens: result.metering.inputTokens,
      outputTokens: result.metering.outputTokens,
      upstreamCostMicros,
    });
    reply.header('X-Credits-Charged', String(settlement.creditsCharged));
    reply.header('X-Credits-Remaining', String(settlement.balanceAfter));
    if (settlement.providerPriceOverrun) reply.header('X-Gateway-Price-Overrun', 'absorbed');
    log.info({ endpoint: route, status: 200, latency_ms: Date.now() - started, credits: settlement.creditsCharged,
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
  } catch (error) {
    await meter.release(reserved.reservation);
    reply.header('X-Credits-Charged', '0');
    reply.code(500).send(toUnexpectedError(error, req.id));
  }
}
