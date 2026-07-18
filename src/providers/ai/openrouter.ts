import { meteredFail, type MeteredProvider, type MeteredProviderResult } from '../_registry.js';
import { providerFetch, type Fetcher } from '../http.js';

interface SummarizeInput { text: string; style: 'concise' | 'bullets' | 'detailed'; maxOutputTokens: number }
interface SummarizeOutput { summary: string; model: string }
interface OpenRouterResponse {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
}

interface OpenRouterPriceCeiling {
  promptUsdMicrosPerMillionTokens: number;
  completionUsdMicrosPerMillionTokens: number;
}

function microsPerMillionTokensToUsdPerToken(value: number): number {
  return value / 1_000_000_000_000;
}

export function createSummarizeProvider(
  apiKey: string,
  model: string,
  priceCeiling: OpenRouterPriceCeiling,
  fetcher: Fetcher = fetch,
): MeteredProvider<SummarizeInput, SummarizeOutput> {
  return {
    id: 'ai.openrouter-summarize',
    storagePolicy: 'metadata-only',
    source: { name: 'OpenRouter', url: 'https://openrouter.ai/docs/guides/overview/models', license: 'Commercial API' },
    async execute(input, ctx): Promise<MeteredProviderResult<SummarizeOutput>> {
      if (!apiKey) return meteredFail('provider_unavailable', 'AI provider is not configured');
      const fetched = await providerFetch(fetcher, 'https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        signal: AbortSignal.timeout(ctx.timeoutMs),
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json', 'user-agent': ctx.userAgent },
        body: JSON.stringify({
          model,
          max_tokens: input.maxOutputTokens,
          temperature: 0.2,
          usage: { include: true },
          provider: {
            sort: 'price',
            data_collection: 'deny',
            max_price: {
              prompt: microsPerMillionTokensToUsdPerToken(
                priceCeiling.promptUsdMicrosPerMillionTokens,
              ),
              completion: microsPerMillionTokensToUsdPerToken(
                priceCeiling.completionUsdMicrosPerMillionTokens,
              ),
            },
          },
          messages: [
            { role: 'system', content: `Summarize the supplied text in a ${input.style} style. Return only the summary.` },
            { role: 'user', content: input.text },
          ],
        }),
      }, 'OpenRouter');
      if (!fetched.ok) return meteredFail(fetched.error.code, fetched.error.message);
      const response = fetched.data;
      if (!response.ok) {
        return meteredFail(response.status === 429 ? 'rate_limited' : 'upstream_error', `OpenRouter returned HTTP ${response.status}`);
      }
      let raw: OpenRouterResponse;
      try { raw = await response.json() as OpenRouterResponse; }
      catch { return meteredFail('upstream_error', 'OpenRouter returned invalid JSON'); }
      const summary = raw.choices?.[0]?.message?.content?.trim();
      if (!summary) return meteredFail('upstream_error', 'OpenRouter returned no summary');
      const inputTokens = raw.usage?.prompt_tokens;
      const outputTokens = raw.usage?.completion_tokens;
      const reportedCost = raw.usage?.cost;
      if (typeof inputTokens !== 'number' || !Number.isSafeInteger(inputTokens) || inputTokens < 0
        || typeof outputTokens !== 'number' || !Number.isSafeInteger(outputTokens) || outputTokens < 0
        || typeof reportedCost !== 'number' || !Number.isFinite(reportedCost) || reportedCost < 0) {
        return meteredFail('upstream_error', 'OpenRouter returned invalid usage data');
      }
      const providerCostMicros = Math.ceil(reportedCost * 1_000_000);
      return {
        ok: true,
        data: { summary, model },
        metering: { providerCostMicros, inputTokens, outputTokens },
      };
    },
  };
}
