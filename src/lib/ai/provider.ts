import 'server-only';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createGroq } from '@ai-sdk/groq';
import type { LanguageModel } from 'ai';
import { aiEnv, type AiEnv } from '@/lib/env';
import { retryAfterMs } from './retry';
import { type AiTask, modelChainFor } from './config';
import { fakeModel } from './fake';

/**
 * Single entry point to the AI providers (research.md §R2, Principle III): the only module that
 * imports `@ai-sdk/google` and `@ai-sdk/groq`. Changing provider never touches the practice domain.
 *
 * Each task has a model chain (`AI_MODEL_*`, src/lib/ai/model-chain.ts). Attempt n of a call uses
 * entry ((n − 1) mod length), so the existing retry loops fail over from one free tier to the next
 * on 429/5xx (research.md §R16).
 */
let google: ReturnType<typeof createGoogleGenerativeAI> | undefined;
let groq: ReturnType<typeof createGroq> | undefined;

export interface ResolvedModel {
  model: LanguageModel;
  /** Recorded in ai_usage and on the session/evaluation (FR-035, FR-044). */
  modelId: string;
  provider?: 'google' | 'groq' | 'fake';
  /**
   * Whether `streamText` + `Output.object` streams the reply incrementally. Groq does not support
   * streaming together with structured output: its buyer turns are generated in one piece.
   * Undefined means true (test doubles).
   */
  streamsStructuredOutput?: boolean;
}

export function modelForAttempt(
  task: AiTask,
  attempt: number,
  env: AiEnv = aiEnv(),
): ResolvedModel {
  if (env.AI_PROVIDER === 'fake') {
    return {
      model: fakeModel(task),
      modelId: `fake-${task}`,
      provider: 'fake',
      streamsStructuredOutput: true,
    };
  }
  const chain = modelChainFor(task, env);
  const ref = chain[(Math.max(1, attempt) - 1) % chain.length]!;
  if (ref.provider === 'groq') {
    groq ??= createGroq({ apiKey: env.GROQ_API_KEY });
    return {
      model: groq(ref.modelId),
      modelId: ref.modelId,
      provider: 'groq',
      streamsStructuredOutput: false,
    };
  }
  google ??= createGoogleGenerativeAI({ apiKey: env.GOOGLE_GENERATIVE_AI_API_KEY });
  return {
    model: google(ref.modelId),
    modelId: ref.modelId,
    provider: 'google',
    streamsStructuredOutput: true,
  };
}

/** First model of the chain (e.g. the model recorded when a session is configured). */
export function getModel(task: AiTask): ResolvedModel {
  return modelForAttempt(task, 1);
}

/**
 * Wait before attempt `nextAttempt`. Failing over to another model is immediate; retrying the same
 * model backs off. Either way, a model that answered with `retry-after` is not called again before
 * that time (Groq's tokens-per-minute 429). One instance per call: it remembers those deadlines.
 */
export function failoverWait(
  resolve: (attempt: number) => ResolvedModel,
  now: () => number = Date.now,
): (nextAttempt: number, baseMs: number, error: unknown) => number {
  const notBefore = new Map<string, number>();
  return (nextAttempt, baseMs, error) => {
    const failed = resolve(nextAttempt - 1).modelId;
    const next = resolve(nextAttempt).modelId;
    const asked = retryAfterMs(error);
    if (asked > 0) notBefore.set(failed, now() + asked);
    const backoff = next === failed ? baseMs : 0;
    return Math.max(backoff, (notBefore.get(next) ?? 0) - now());
  };
}
