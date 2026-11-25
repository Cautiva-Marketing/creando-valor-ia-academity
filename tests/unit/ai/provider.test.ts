import { describe, expect, it } from 'vitest';
import { APICallError } from 'ai';
import { failoverWait, modelForAttempt, type ResolvedModel } from '@/lib/ai/provider';
import { parseAiEnv } from '@/lib/env';

/**
 * Model chain per attempt (pilot on free tiers): attempt n uses entry ((n − 1) mod length) of the
 * task's chain, so a 429/503 on one provider fails over to the next. Groq cannot stream structured
 * output, so its buyer turns are generated in one piece.
 */
const env = parseAiEnv({
  GOOGLE_GENERATIVE_AI_API_KEY: 'AIza-test',
  GROQ_API_KEY: 'gsk_test',
  AI_MODEL_EVALUATOR: 'groq:openai/gpt-oss-120b,google:gemini-3.6-flash',
});

describe('modelForAttempt', () => {
  it('walks the chain and wraps around', () => {
    const ids = [1, 2, 3].map((n) => modelForAttempt('evaluator', n, env).modelId);
    expect(ids).toEqual(['openai/gpt-oss-120b', 'gemini-3.6-flash', 'openai/gpt-oss-120b']);
  });

  it('marks which providers stream structured output', () => {
    expect(modelForAttempt('evaluator', 1, env)).toMatchObject({
      provider: 'groq',
      streamsStructuredOutput: false,
    });
    expect(modelForAttempt('evaluator', 2, env)).toMatchObject({
      provider: 'google',
      streamsStructuredOutput: true,
    });
  });

  it('uses the fake model on every attempt with AI_PROVIDER=fake', () => {
    const fake = parseAiEnv({ AI_PROVIDER: 'fake', NODE_ENV: 'test' });
    expect(modelForAttempt('buyer', 2, fake)).toMatchObject({
      modelId: 'fake-buyer',
      provider: 'fake',
      streamsStructuredOutput: true,
    });
  });
});

describe('failoverWait', () => {
  const limited = (seconds: string) =>
    new APICallError({
      message: '429',
      url: 'mock://',
      requestBodyValues: {},
      statusCode: 429,
      responseHeaders: { 'retry-after': seconds },
    });
  const chain =
    (...ids: string[]) =>
    (attempt: number): ResolvedModel => ({
      model: {} as ResolvedModel['model'],
      modelId: ids[(attempt - 1) % ids.length]!,
    });

  it('switches model without waiting and backs off when retrying the same one', () => {
    expect(failoverWait(chain('a', 'b'))(2, 1_000, new Error('x'))).toBe(0);
    expect(failoverWait(chain('a'))(2, 1_000, new Error('x'))).toBe(1_000);
  });

  it('honours retry-after when the same model comes back', () => {
    let now = 0;
    const wait = failoverWait(chain('groq', 'gemini'), () => now);
    // Attempt 1 (groq) asks for 13 s; attempt 2 goes to gemini at once.
    expect(wait(2, 1_000, limited('13'))).toBe(0);
    now = 4_000;
    // Attempt 2 (gemini) fails too; attempt 3 returns to groq: the 9 s left of its retry-after.
    expect(wait(3, 3_000, new Error('503'))).toBe(9_000);
    // Retrying the same model: at least its retry-after.
    expect(failoverWait(chain('groq'), () => 0)(2, 1_000, limited('5'))).toBe(5_000);
  });
});
