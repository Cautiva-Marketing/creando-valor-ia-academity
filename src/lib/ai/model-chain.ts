/**
 * Model chains per AI task (pilot on free tiers, research.md §R16): `AI_MODEL_*` holds a comma-separated
 * list of `provider:model` entries tried in order, so a 429/503 on one provider fails over to the next.
 * A bare model id means Google (the format used before the chain existed). Pure module: imported by
 * src/lib/env.ts to validate the variables and by the adapter to resolve them.
 */
export const AI_PROVIDERS = ['google', 'groq'] as const;
export type AiProviderName = (typeof AI_PROVIDERS)[number];

export interface ModelRef {
  provider: AiProviderName;
  modelId: string;
}

/** Env variable holding the API key of each provider. */
export const PROVIDER_KEY_VARS: Record<AiProviderName, string> = {
  google: 'GOOGLE_GENERATIVE_AI_API_KEY',
  groq: 'GROQ_API_KEY',
};

const isProvider = (value: string): value is AiProviderName =>
  (AI_PROVIDERS as readonly string[]).includes(value);

/** Throws with a readable message on unknown providers or empty entries. */
export function parseModelChain(value: string): ModelRef[] {
  return value.split(',').map((raw) => {
    const entry = raw.trim();
    if (!entry) throw new Error('model chain has an empty entry');
    const colon = entry.indexOf(':');
    if (colon === -1) return { provider: 'google', modelId: entry };
    const provider = entry.slice(0, colon).trim();
    const modelId = entry.slice(colon + 1).trim();
    if (!isProvider(provider)) {
      throw new Error(`unknown AI provider "${provider}" (use ${AI_PROVIDERS.join(' or ')})`);
    }
    if (!modelId) throw new Error(`model chain entry "${entry}" has an empty model id`);
    return { provider, modelId };
  });
}

/** Keeps only the entries whose provider has an API key configured. */
export function usableEntries(
  chain: readonly ModelRef[],
  keys: Partial<Record<AiProviderName, string | undefined>>,
): ModelRef[] {
  return chain.filter((ref) => Boolean(keys[ref.provider]));
}
