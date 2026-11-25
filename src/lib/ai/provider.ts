import 'server-only';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import type { LanguageModel } from 'ai';
import { aiEnv } from '@/lib/env';
import { type AiTask, modelIdFor } from './config';
import { fakeModel } from './fake';

/**
 * Single entry point to the AI provider (research.md §R2, Principle III): the only module that
 * imports `@ai-sdk/google`. Changing provider never touches the practice domain.
 */
let google: ReturnType<typeof createGoogleGenerativeAI> | undefined;

export interface ResolvedModel {
  model: LanguageModel;
  /** Recorded in ai_usage and on the session/evaluation (FR-035, FR-044). */
  modelId: string;
}

export function getModel(task: AiTask): ResolvedModel {
  const env = aiEnv();
  if (env.AI_PROVIDER === 'fake') {
    return { model: fakeModel(task), modelId: `fake-${task}` };
  }
  google ??= createGoogleGenerativeAI({ apiKey: env.GOOGLE_GENERATIVE_AI_API_KEY });
  const modelId = modelIdFor(task);
  return { model: google(modelId), modelId };
}
