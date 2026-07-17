import type { StoragePolicy } from '../policy/registry.js';

/**
 * Provider contract (architecture.md §4.1). Every endpoint category goes
 * through one internal contract. This file is the clean-room boundary — every
 * concrete provider is built from public protocols, licensed datasets, or
 * first-party code, never from a competitor's output.
 */

/** Stable identifier used in logs, usage rows, and source metadata. */
export type ProviderId = string;

/** Human-readable source attribution surfaced in the API response + docs. */
export interface ProviderSource {
  name: string;
  url: string;
  license: string;
  notes?: string;
}

/** How a route's payload may be persisted (catalog-and-pricing-strategy.md §6). */
export type { StoragePolicy };

export type UpstreamErrorCode =
  | 'bad_input'
  | 'provider_unavailable'
  | 'upstream_error'
  | 'upstream_timeout'
  | 'rate_limited';

/** A provider's own result type — never throws for expected upstream errors. */
export type ProviderResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: UpstreamErrorCode; message: string } };

/** Handed to every execute() call. */
export interface ProviderContext {
  requestId: string;
  /** Abort after this many ms — every provider honors it. */
  timeoutMs: number;
  /** User-Agent to send to upstreams (NOAA requires identifying UA). */
  userAgent: string;
}

export interface Provider<Req, Res> {
  readonly id: ProviderId;
  readonly source: ProviderSource;
  /** The route's storage posture. Compute providers are always 'none'. */
  readonly storagePolicy: StoragePolicy;
  execute(req: Req, ctx: ProviderContext): Promise<ProviderResult<Res>>;
}

export interface MeteringMetadata {
  providerCostMicros: number;
  inputTokens: number;
  outputTokens: number;
}

export type MeteredProviderResult<T> =
  | { ok: true; data: T; metering: MeteringMetadata }
  | { ok: false; error: { code: UpstreamErrorCode; message: string } };

export interface MeteredProvider<Req, Res> {
  readonly id: ProviderId;
  readonly source: ProviderSource;
  readonly storagePolicy: StoragePolicy;
  execute(req: Req, ctx: ProviderContext): Promise<MeteredProviderResult<Res>>;
}

/** Helpers for the result discriminated union. */
export const ok = <T>(data: T): ProviderResult<T> => ({ ok: true, data });
export const fail = <T>(
  code: UpstreamErrorCode,
  message: string,
): ProviderResult<T> => ({ ok: false, error: { code, message } });

export const meteredFail = <T>(
  code: UpstreamErrorCode,
  message: string,
): MeteredProviderResult<T> => ({ ok: false, error: { code, message } });
