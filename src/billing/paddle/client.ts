import type { Config } from '../../config.js';
import type { PaddleCreditPack } from './catalog.js';

export interface PaddleCheckout {
  transactionId: string;
  checkoutUrl: string;
}

export type PaddleFetcher = (input: string, init?: RequestInit) => Promise<Response>;

export class PaddleClient {
  private readonly apiBase: string;

  constructor(
    private readonly config: Config,
    private readonly fetcher: PaddleFetcher = fetch,
  ) {
    this.apiBase = config.paddleEnvironment === 'production'
      ? 'https://api.paddle.com'
      : 'https://sandbox-api.paddle.com';
  }

  async createCheckout(pack: PaddleCreditPack, orgId: string): Promise<PaddleCheckout> {
    let response: Response;
    try {
      response = await this.fetcher(`${this.apiBase}/transactions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.paddleApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          items: [{ price_id: pack.priceId, quantity: 1 }],
          custom_data: {
            gateway_org_id: orgId,
            gateway_pack_id: pack.packId,
            gateway_pricing_version: pack.pricingVersion,
          },
          checkout: { url: this.config.paddleCheckoutUrl },
        }),
        signal: AbortSignal.timeout(this.config.upstreamTimeoutMs),
      });
    } catch {
      throw new Error('Paddle checkout is unavailable');
    }
    if (!response.ok) throw new Error('Paddle checkout is unavailable');

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new Error('Paddle returned an invalid checkout');
    }
    const data = (payload as { data?: { id?: unknown; checkout?: { url?: unknown } } }).data;
    if (typeof data?.id !== 'string' || typeof data.checkout?.url !== 'string') {
      throw new Error('Paddle returned an invalid checkout');
    }
    let url: URL;
    try {
      url = new URL(data.checkout.url);
    } catch {
      throw new Error('Paddle returned an invalid checkout');
    }
    if (url.protocol !== 'https:') throw new Error('Paddle returned an invalid checkout');
    return { transactionId: data.id, checkoutUrl: url.toString() };
  }
}
