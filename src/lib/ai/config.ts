import 'server-only';
import { aiEnv } from '@/lib/env';

/**
 * Per-task model parameters (research.md §R2). The domain never sees these: it asks for a task and
 * the adapter decides temperature, output budget and reasoning budget.
 */
export type AiTask = 'buyer_setup' | 'buyer' | 'evaluator';

export interface AiTaskConfig {
  temperature: number;
  maxOutputTokens: number;
  /** Gemini thinking budget in tokens (0 = no reasoning, lowest latency). */
  thinkingBudget: number;
  /** Abort a single attempt after this many milliseconds (counts as a retryable timeout). */
  timeoutMs: number;
}

export const AI_TASK_CONFIG: Record<AiTask, AiTaskConfig> = {
  // Persona + opening message + generated hidden objection: varied but bounded (FR-011–FR-013).
  buyer_setup: { temperature: 0.9, maxOutputTokens: 2048, thinkingBudget: 0, timeoutMs: 25_000 },
  // Buyer turns: latency first (SC-007, first chunk < 2.5 s).
  buyer: { temperature: 0.8, maxOutputTokens: 1024, thinkingBudget: 0, timeoutMs: 20_000 },
  // Evaluation: deliberate and stable (FR-038–FR-040).
  evaluator: { temperature: 0.2, maxOutputTokens: 8192, thinkingBudget: 2048, timeoutMs: 50_000 },
};

/** Call settings shared by every AI SDK call of a task. Retries are ours (src/lib/ai/retry.ts). */
export function callSettingsFor(task: AiTask) {
  const config = AI_TASK_CONFIG[task];
  return {
    temperature: config.temperature,
    maxOutputTokens: config.maxOutputTokens,
    maxRetries: 0,
    providerOptions: { google: { thinkingConfig: { thinkingBudget: config.thinkingBudget } } },
  };
}

export function modelIdFor(task: AiTask): string {
  const env = aiEnv();
  switch (task) {
    case 'buyer_setup':
      return env.AI_MODEL_BUYER_SETUP;
    case 'buyer':
      return env.AI_MODEL_BUYER;
    case 'evaluator':
      return env.AI_MODEL_EVALUATOR;
  }
}
