import { afterEach, describe, expect, it, vi } from 'vitest';
import { AI_TASK_CONFIG, callSettingsFor, modelChainFor, parseModelChain } from '@/lib/ai/config';
import { estimateCostUsd } from '@/lib/ai/pricing';
import { parseAiEnv } from '@/lib/env';

/** T027 (research.md §R2): per-task parameters, model ids from env and list pricing. */

afterEach(() => vi.unstubAllEnvs());

describe('AI task configuration', () => {
  it('keeps the buyer fast (minimal reasoning) and the evaluator deliberate', () => {
    // Gemini 3 takes a thinking level; `thinkingBudget: 0` is rejected by gemini-3.5-flash-lite (T003).
    expect(AI_TASK_CONFIG.buyer.thinkingLevel).toBe('minimal');
    expect(AI_TASK_CONFIG.evaluator.thinkingLevel).toBe('medium');
    expect(AI_TASK_CONFIG.evaluator.temperature).toBeLessThan(AI_TASK_CONFIG.buyer.temperature);
  });

  it('builds call settings with the Google thinking level and no SDK retries', () => {
    expect(callSettingsFor('buyer')).toEqual({
      temperature: AI_TASK_CONFIG.buyer.temperature,
      maxOutputTokens: AI_TASK_CONFIG.buyer.maxOutputTokens,
      maxRetries: 0,
      providerOptions: {
        google: { thinkingConfig: { thinkingLevel: 'minimal' } },
        // Groq: JSON schema without strict mode (the setup schema has an optional field).
        groq: { reasoningEffort: 'low', structuredOutputs: true, strictJsonSchema: false },
      },
    });
  });

  it('gives the evaluator a deliberate Groq reasoning effort and a strict schema', () => {
    // Without strict mode gpt-oss ignored enums (e.g. a criterion key as the drill stage).
    expect(callSettingsFor('evaluator').providerOptions.groq).toMatchObject({
      reasoningEffort: 'medium',
      strictJsonSchema: true,
    });
    // The setup schema has an optional field: strict mode would reject it.
    expect(callSettingsFor('buyer_setup').providerOptions.groq.strictJsonSchema).toBe(false);
  });
});

describe('model chains (pilot on free tiers: Gemini + Groq failover)', () => {
  it('parses provider:model entries; a bare id is Google', () => {
    expect(parseModelChain('gemini-3.5-flash-lite')).toEqual([
      { provider: 'google', modelId: 'gemini-3.5-flash-lite' },
    ]);
    expect(parseModelChain(' groq:openai/gpt-oss-120b , google:gemini-3.6-flash ')).toEqual([
      { provider: 'groq', modelId: 'openai/gpt-oss-120b' },
      { provider: 'google', modelId: 'gemini-3.6-flash' },
    ]);
  });

  it('rejects unknown providers and empty entries', () => {
    expect(() => parseModelChain('openai:gpt-5')).toThrow(/openai/);
    expect(() => parseModelChain('google:gemini-3.6-flash,,')).toThrow(/empty/);
    expect(() => parseModelChain('groq:')).toThrow(/empty/);
  });

  it('reads the chain per task from env and keeps only providers with a key', () => {
    const base = {
      GOOGLE_GENERATIVE_AI_API_KEY: 'AIza-test',
      AI_MODEL_EVALUATOR: 'groq:openai/gpt-oss-120b,google:gemini-3.6-flash',
    };
    expect(modelChainFor('evaluator', parseAiEnv(base))).toEqual([
      { provider: 'google', modelId: 'gemini-3.6-flash' },
    ]);
    expect(modelChainFor('evaluator', parseAiEnv({ ...base, GROQ_API_KEY: 'gsk_test' }))).toEqual([
      { provider: 'groq', modelId: 'openai/gpt-oss-120b' },
      { provider: 'google', modelId: 'gemini-3.6-flash' },
    ]);
  });

  it('defaults: Groq first for setup and evaluation, Gemini first for streamed turns', () => {
    const env = parseAiEnv({ GOOGLE_GENERATIVE_AI_API_KEY: 'AIza-test', GROQ_API_KEY: 'gsk_test' });
    expect(modelChainFor('buyer', env).map((m) => m.provider)).toEqual(['google', 'groq']);
    expect(modelChainFor('buyer_setup', env).map((m) => m.provider)).toEqual(['groq', 'google']);
    expect(modelChainFor('evaluator', env).map((m) => m.provider)).toEqual(['groq', 'google']);
  });
});

describe('estimateCostUsd', () => {
  it('uses list prices per million tokens', () => {
    expect(estimateCostUsd('gemini-3.6-flash', 1_000_000, 1_000_000)).toBe(9);
    expect(estimateCostUsd('gemini-3.8-flash', 1_000_000, 1_000_000)).toBe(9);
    expect(estimateCostUsd('gemini-3.5-flash-lite', 1_000_000, 1_000_000)).toBe(2.8);
  });

  it('matches versioned model ids by prefix and rounds to 6 decimals', () => {
    expect(estimateCostUsd('gemini-3.5-flash-lite-preview-11-2026', 1234, 567)).toBe(0.001788);
    expect(estimateCostUsd('models/gemini-3.6-flash', 1000, 0)).toBe(0.0015);
  });

  it('costs nothing for fake models and unknown models fall back to the flash price', () => {
    expect(estimateCostUsd('fake-buyer', 1000, 1000)).toBe(0);
    expect(estimateCostUsd('modelo-nuevo', 1_000_000, 0)).toBe(1.5);
  });

  it('prices the Groq models', () => {
    expect(estimateCostUsd('openai/gpt-oss-120b', 1_000_000, 1_000_000)).toBe(0.75);
    expect(estimateCostUsd('openai/gpt-oss-20b', 1_000_000, 1_000_000)).toBe(0.375);
  });
});
