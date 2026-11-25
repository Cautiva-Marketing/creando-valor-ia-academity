import { APICallError } from 'ai';
import { MockLanguageModelV3 } from 'ai/test';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildEvaluatorPrompt } from '@/features/practice/ai/evaluator-input';
import { runEvaluator } from '@/features/practice/ai/evaluator';
import { evaluationOutputSchema } from '@/features/practice/ai/schemas';
import { AI_TASK_CONFIG } from '@/lib/ai/config';
import { fakeModel, resetFakeProvider } from '@/lib/ai/fake';
import type { AiUsageInput } from '@/lib/ai/usage';
import { evaluationClaim } from '../../fixtures/practice/evaluation-claim';

/** T135 — evaluator call (contracts/ai-agents.md → "Evaluador"; FR-038–FR-040). */

type Step = { text: string } | { status: number } | 'hang';
type GenerateResult = Awaited<ReturnType<MockLanguageModelV3['doGenerate']>>;

function model(steps: Step[]) {
  let calls = 0;
  const mock = new MockLanguageModelV3({
    modelId: 'mock-evaluator',
    doGenerate: async (options): Promise<GenerateResult> => {
      const step = steps[Math.min(calls, steps.length - 1)]!;
      calls++;
      if (step === 'hang') {
        return new Promise((_, reject) => {
          options.abortSignal?.addEventListener('abort', () => reject(options.abortSignal!.reason));
        });
      }
      if ('status' in step) {
        throw new APICallError({
          message: 'error',
          url: 'mock://',
          requestBodyValues: {},
          statusCode: step.status,
          isRetryable: true,
        });
      }
      return {
        content: [{ type: 'text', text: step.text }],
        finishReason: { unified: 'stop', raw: 'stop' },
        usage: {
          inputTokens: { total: 100, noCache: 100, cacheRead: 0, cacheWrite: 0 },
          outputTokens: { total: 50, text: 50, reasoning: 0 },
        },
        warnings: [],
      };
    },
  });
  return { mock, calls: () => calls };
}

const fakeOutput = () => buildEvaluatorPrompt(evaluationClaim());

function validJson(): string {
  return JSON.stringify({
    rubric_version: '1.0',
    criteria: evaluationClaim().rubric.criteria.map((c) => ({
      criterion_id: c.key,
      status: 'evaluated',
      score: c.weight - 1,
      max_score: c.weight,
      evidence_message_ids: ['m2'],
      justification: 'Bien.',
      improvement: 'Más preguntas.',
      confidence: 0.9,
    })),
    total_score: null,
    strengths: ['Saludo'],
    improvements: ['Plazo'],
    suggested_drill: { text: 'Pregunta abierta.', stage: 'conoce' },
    ethical_flags: [],
  });
}

async function run(steps: Step[], extra: { dueInMs?: number; timeoutMs?: number } = {}) {
  const { mock, calls } = model(steps);
  const usage: AiUsageInput[] = [];
  const claim = evaluationClaim();
  if (extra.dueInMs !== undefined) {
    claim.session.dueAt = new Date(Date.now() + extra.dueInMs).toISOString();
  }
  const result = await runEvaluator(claim, {
    resolveModel: () => ({ model: mock, modelId: 'mock-evaluator' }),
    recordUsage: async (row) => {
      usage.push(row);
    },
    retry: { delaysMs: [0, 0], random: () => 0 },
    timeoutMs: extra.timeoutMs,
  });
  return { result, usage, calls, mock };
}

beforeEach(() => resetFakeProvider());

describe('buildEvaluatorPrompt (FR-038)', () => {
  it('carries transcript ids mN, the scenario with the product version and the rubric only', () => {
    const claim = evaluationClaim();
    const { system, prompt } = fakeOutput();
    expect(prompt).toContain('"id":"m2","autor":"vendedor"');
    expect(prompt).toContain('"id":"m1","autor":"cliente"');
    expect(prompt).toContain('"version":2');
    expect(prompt).toContain('Más de 500 egresados');
    expect(prompt).toContain('"key":"diagnosis"');
    expect(prompt).toContain('"peso":20');
    expect(prompt).not.toContain(claim.session.userId);
    expect(prompt).not.toContain(claim.session.organizationId);
    expect(prompt).not.toMatch(/@|correo|email/i);
    expect(system).not.toContain('Lucía');
  });
});

describe('runEvaluator', () => {
  it('uses a 50 s timeout per attempt and temperature ~0.2', () => {
    expect(AI_TASK_CONFIG.evaluator.timeoutMs).toBe(50_000);
    expect(AI_TASK_CONFIG.evaluator.temperature).toBeCloseTo(0.2);
  });

  it('valid output → ok, one evaluator usage row with the session id', async () => {
    const { result, usage, mock } = await run([{ text: validJson() }]);
    expect(result).toMatchObject({
      ok: true,
      promptVersion: 'evaluator@1.0.0',
      modelId: 'mock-evaluator',
    });
    if (result.ok) expect(evaluationOutputSchema.safeParse(result.output).success).toBe(true);
    expect(usage).toEqual([
      expect.objectContaining({
        task: 'evaluator',
        simulationId: '00000000-0000-4000-9000-000000000e01',
        outcome: 'success',
        attempt: 1,
        inputTokens: 100,
        outputTokens: 50,
      }),
    ]);
    expect(mock.doGenerateCalls[0]!.temperature).toBeCloseTo(0.2);
    expect(mock.doGenerateCalls[0]!.abortSignal).toBeDefined();
  });

  it('429 twice then valid → 3 attempts, usage per attempt', async () => {
    const { result, usage, calls } = await run([
      { status: 429 },
      { status: 429 },
      { text: validJson() },
    ]);
    expect(result.ok).toBe(true);
    expect(calls()).toBe(3);
    expect(usage.map((u) => u.outcome)).toEqual(['retry', 'retry', 'success']);
  });

  it('provider down → provider_error after at most 3 attempts', async () => {
    const { result, usage, calls } = await run([{ status: 503 }]);
    expect(result).toMatchObject({ ok: false, failureCode: 'provider_error' });
    expect(calls()).toBe(3);
    expect(usage.map((u) => u.outcome)).toEqual(['retry', 'retry', 'failure']);
  });

  it('output that does not parse → invalid_output without retrying here', async () => {
    const { result, calls } = await run([{ text: '{"criteria": []}' }]);
    expect(result).toMatchObject({ ok: false, failureCode: 'invalid_output' });
    expect(calls()).toBe(1);
  });

  it('an attempt that hangs is aborted → timeout', async () => {
    const { result, calls } = await run(['hang'], { timeoutMs: 20 });
    expect(result).toMatchObject({ ok: false, failureCode: 'timeout' });
    expect(calls()).toBe(3);
  });

  it('no retries beyond the evaluation deadline', async () => {
    const { result, calls } = await run([{ status: 429 }], { dueInMs: 5_000 });
    expect(result.ok).toBe(false);
    expect(calls()).toBe(1);
  });

  it('the fake evaluator script returns a valid evaluation from the prompt', async () => {
    const result = await runEvaluator(evaluationClaim(), {
      resolveModel: () => ({ model: fakeModel('evaluator'), modelId: 'fake-evaluator' }),
      recordUsage: async () => {},
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.output.criteria).toHaveLength(7);
    const cited = result.output.criteria.flatMap((c) => c.evidence_message_ids);
    expect(cited.every((id) => id === 'm2' || id === 'm4')).toBe(true);
  });
});
