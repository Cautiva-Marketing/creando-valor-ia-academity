/**
 * List prices in US$ per million tokens (research.md §R2). `ai_usage.estimated_cost_usd` records the
 * list cost even on the free tier, to size the move to a paid plan. Update when Google changes prices.
 * Matching is by longest prefix so versioned ids (`gemini-2.5-flash-preview-…`) resolve to their family.
 */
interface ModelPrice {
  inputPerMillion: number;
  outputPerMillion: number;
}

const PRICES: Record<string, ModelPrice> = {
  'gemini-2.5-pro': { inputPerMillion: 1.25, outputPerMillion: 10 },
  'gemini-2.5-flash': { inputPerMillion: 0.3, outputPerMillion: 2.5 },
  'gemini-2.5-flash-lite': { inputPerMillion: 0.1, outputPerMillion: 0.4 },
  'gemini-2.0-flash': { inputPerMillion: 0.1, outputPerMillion: 0.4 },
  'gemini-2.0-flash-lite': { inputPerMillion: 0.075, outputPerMillion: 0.3 },
};

/** Unknown models are estimated at the Flash price rather than recorded as free. */
const FALLBACK = PRICES['gemini-2.5-flash']!;

const PREFIXES = Object.keys(PRICES).sort((a, b) => b.length - a.length);

export function priceFor(modelId: string): ModelPrice {
  if (modelId.startsWith('fake')) return { inputPerMillion: 0, outputPerMillion: 0 };
  const id = modelId.replace(/^models\//, '');
  const prefix = PREFIXES.find((p) => id.startsWith(p));
  return prefix ? PRICES[prefix]! : FALLBACK;
}

export function estimateCostUsd(
  modelId: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const price = priceFor(modelId);
  const cost =
    (inputTokens * price.inputPerMillion + outputTokens * price.outputPerMillion) / 1_000_000;
  return Math.round(cost * 1_000_000) / 1_000_000;
}
