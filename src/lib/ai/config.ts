import 'server-only';
import { aiEnv, type AiEnv } from '@/lib/env';
import { parseModelChain, usableEntries, type ModelRef } from './model-chain';

export { parseModelChain, type AiProviderName, type ModelRef } from './model-chain';

/**
 * Per-task model parameters (research.md §R2). The domain never sees these: it asks for a task and
 * the adapter decides temperature, output budget, reasoning and which models to try.
 */
export type AiTask = 'buyer_setup' | 'buyer' | 'evaluator';

export interface AiTaskConfig {
  temperature: number;
  maxOutputTokens: number;
  /**
   * Gemini 3 thinking level (T003): `minimal` is the lowest latency but not every model accepts it
   * (gemini-3.8-flash rejects it; use `low` there). The older `thinkingBudget: 0` is rejected by
   * gemini-3.5-flash-lite.
   */
  thinkingLevel: 'minimal' | 'low' | 'medium' | 'high';
  /** Groq reasoning effort for the gpt-oss models (they always reason; `low` keeps turns fast). */
  reasoningEffort: 'low' | 'medium' | 'high';
  /**
   * Groq strict JSON schema (constrained decoding: enums and required fields are enforced). Only for
   * schemas whose properties are all required; the setup schema has an optional field.
   */
  groqStrictSchema: boolean;
  /** Abort a single attempt after this many milliseconds (counts as a retryable timeout). */
  timeoutMs: number;
}

export const AI_TASK_CONFIG: Record<AiTask, AiTaskConfig> = {
  // Persona + opening message + generated hidden objection: varied but bounded (FR-011–FR-013).
  buyer_setup: {
    temperature: 0.9,
    maxOutputTokens: 4096,
    thinkingLevel: 'low',
    reasoningEffort: 'low',
    groqStrictSchema: false,
    timeoutMs: 25_000,
  },
  // Buyer turns: latency first (SC-007, first chunk < 2.5 s).
  buyer: {
    temperature: 0.8,
    maxOutputTokens: 2048,
    thinkingLevel: 'minimal',
    reasoningEffort: 'low',
    groqStrictSchema: false,
    timeoutMs: 20_000,
  },
  // Evaluation: deliberate and stable (FR-038–FR-040).
  // Reasoning tokens count as output on Gemini 3 and gpt-oss: room for reasoning + JSON.
  evaluator: {
    temperature: 0.2,
    maxOutputTokens: 16384,
    thinkingLevel: 'medium',
    reasoningEffort: 'medium',
    groqStrictSchema: true,
    timeoutMs: 50_000,
  },
};

/**
 * Call settings shared by every AI SDK call of a task. Retries are ours (src/lib/ai/retry.ts). Each
 * provider reads only its own key of `providerOptions`, so one object serves the whole chain. Groq
 * uses strict mode where the schema allows it (`groqStrictSchema`); the AI SDK validates the result
 * with Zod in every case.
 */
export function callSettingsFor(task: AiTask) {
  const config = AI_TASK_CONFIG[task];
  return {
    temperature: config.temperature,
    maxOutputTokens: config.maxOutputTokens,
    maxRetries: 0,
    providerOptions: {
      google: { thinkingConfig: { thinkingLevel: config.thinkingLevel } },
      groq: {
        reasoningEffort: config.reasoningEffort,
        structuredOutputs: true,
        strictJsonSchema: config.groqStrictSchema,
      },
    },
  };
}

function chainVariable(task: AiTask, env: AiEnv): string {
  switch (task) {
    case 'buyer_setup':
      return env.AI_MODEL_BUYER_SETUP;
    case 'buyer':
      return env.AI_MODEL_BUYER;
    case 'evaluator':
      return env.AI_MODEL_EVALUATOR;
  }
}

/** Models to try for a task, in order, keeping only providers with an API key (validated in env). */
export function modelChainFor(task: AiTask, env: AiEnv = aiEnv()): ModelRef[] {
  return usableEntries(parseModelChain(chainVariable(task, env)), {
    google: env.GOOGLE_GENERATIVE_AI_API_KEY,
    groq: env.GROQ_API_KEY,
  });
}
