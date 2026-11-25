import { afterEach, describe, expect, it, vi } from 'vitest';
import { AI_TASK_CONFIG, callSettingsFor, modelIdFor } from '@/lib/ai/config';
import { estimateCostUsd } from '@/lib/ai/pricing';

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
      providerOptions: { google: { thinkingConfig: { thinkingLevel: 'minimal' } } },
    });
  });

  it('reads model ids from env per task', () => {
    vi.stubEnv('AI_MODEL_BUYER', 'modelo-cliente');
    vi.stubEnv('AI_MODEL_EVALUATOR', 'modelo-evaluador');
    vi.stubEnv('AI_MODEL_BUYER_SETUP', '');
    expect(modelIdFor('buyer')).toBe('modelo-cliente');
    expect(modelIdFor('evaluator')).toBe('modelo-evaluador');
    expect(modelIdFor('buyer_setup')).toBe('gemini-3.6-flash');
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
});
