import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EvaluatorResult } from '@/features/practice/ai/evaluator';
import type { EvaluationOutput } from '@/features/practice/ai/schemas';
import { runEvaluation, type EvaluationDb } from '@/features/practice/evaluation/run-evaluation';
import { evaluationClaim, SAMPLE_TRANSCRIPT } from '../../fixtures/practice/evaluation-claim';

/** T136 — runEvaluation (research.md §R8, §R9; FR-040, FR-043). */

const SESSION = '00000000-0000-4000-9000-000000000e01';

function output(): EvaluationOutput {
  return {
    rubric_version: '1.0',
    criteria: evaluationClaim().rubric.criteria.map((c) => ({
      criterion_id: c.key,
      status: 'evaluated',
      score: c.weight - 2,
      max_score: c.weight,
      evidence_message_ids: ['m2'],
      justification: 'Bien.',
      improvement: 'Más preguntas.',
      confidence: 0.8,
    })),
    total_score: 99,
    strengths: ['Saludo'],
    improvements: ['Plazo'],
    suggested_drill: { text: 'Pregunta abierta.', stage: 'conoce' },
    ethical_flags: [],
  };
}

const ok = (o: EvaluationOutput = output()): EvaluatorResult => ({
  ok: true,
  output: o,
  modelId: 'gemini-test',
  promptVersion: 'evaluator@1.1.0',
});

interface DbScript {
  claims?: unknown[];
  save?: { code?: string; message: string } | null;
  failStatuses?: string[];
}

function fakeDb(script: DbScript = {}) {
  const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const claims = [...(script.claims ?? [evaluationClaim()])];
  const failStatuses = [...(script.failStatuses ?? ['pending', 'pending', 'failed'])];
  const db: EvaluationDb = {
    rpc: async (fn, args) => {
      calls.push({ fn, args });
      switch (fn) {
        case 'claim_practice_evaluation':
          return { data: claims.length > 0 ? claims.shift() : null, error: null };
        case 'save_practice_evaluation':
          return script.save
            ? { data: null, error: script.save }
            : { data: 'evaluation-id', error: null };
        case 'fail_practice_evaluation_attempt':
          return { data: [{ evaluation_status: failStatuses.shift() ?? 'failed' }], error: null };
        default:
          return { data: null, error: null };
      }
    },
  };
  return {
    db,
    calls,
    names: () =>
      calls.map((c) => `${c.fn}${'p_phase' in c.args ? `:${String(c.args.p_phase)}` : ''}`),
  };
}

afterEach(() => vi.restoreAllMocks());

describe('runEvaluation', () => {
  it('claim NULL → nothing happens', async () => {
    const { db, names } = fakeDb({ claims: [] });
    const evaluate = vi.fn();
    expect(await runEvaluation(SESSION, { db, evaluate })).toBe('skipped');
    expect(evaluate).not.toHaveBeenCalled();
    expect(names()).toEqual(['claim_practice_evaluation']);
  });

  it('phases reading → scoring → reporting, then saves with prompt version and model', async () => {
    const { db, calls, names } = fakeDb();
    expect(await runEvaluation(SESSION, { db, evaluate: async () => ok() })).toBe('evaluated');
    expect(names()).toEqual([
      'claim_practice_evaluation',
      'set_practice_evaluation_phase:scoring',
      'set_practice_evaluation_phase:reporting',
      'save_practice_evaluation',
    ]);
    const payload = calls.at(-1)!.args.p_payload as Record<string, unknown>;
    expect(payload).toMatchObject({
      rubric_id: '00000000-0000-4000-8000-0000000000a1',
      prompt_version: 'evaluator@1.1.0',
      model: 'gemini-test',
      total_score: 86,
    });
    expect((payload.criteria as Array<{ evidence_seqs: number[] }>)[0]!.evidence_seqs).toEqual([2]);
  });

  it('invalid output → fails the attempt and claims again', async () => {
    const bad = output();
    bad.criteria[0]!.evidence_message_ids = ['m1']; // a buyer message
    const { db, calls } = fakeDb({ claims: [evaluationClaim(), evaluationClaim()] });
    const evaluate = vi
      .fn<() => Promise<EvaluatorResult>>()
      .mockResolvedValueOnce(ok(bad))
      .mockResolvedValueOnce(ok());
    expect(await runEvaluation(SESSION, { db, evaluate })).toBe('evaluated');
    expect(calls.filter((c) => c.fn === 'fail_practice_evaluation_attempt')).toEqual([
      {
        fn: 'fail_practice_evaluation_attempt',
        args: { p_session: SESSION, p_failure_code: 'invalid_output' },
      },
    ]);
    expect(evaluate).toHaveBeenCalledTimes(2);
  });

  it('provider failures until the attempts run out → failed', async () => {
    const { db } = fakeDb({ claims: [evaluationClaim(), evaluationClaim(), evaluationClaim()] });
    const evaluate = async (): Promise<EvaluatorResult> => ({
      ok: false,
      failureCode: 'timeout',
      modelId: 'gemini-test',
    });
    expect(await runEvaluation(SESSION, { db, evaluate })).toBe('failed');
  });

  it('a 23514 from the SQL layer counts as invalid output; unavailable is final', async () => {
    const { db, calls } = fakeDb({
      save: { code: '23514', message: 'evidence' },
      failStatuses: ['unavailable'],
    });
    const report = vi.fn();
    expect(await runEvaluation(SESSION, { db, evaluate: async () => ok(), report })).toBe(
      'unavailable',
    );
    expect(calls.at(-1)!.args.p_failure_code).toBe('invalid_output');
    expect(report).not.toHaveBeenCalled();
  });

  it('never logs content (transcript, persona, evaluation texts)', async () => {
    const logged: string[] = [];
    for (const method of ['log', 'info', 'warn', 'error'] as const) {
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
        logged.push(args.map(String).join(' '));
      });
    }
    const { db } = fakeDb({ save: { code: 'XX000', message: 'boom' }, failStatuses: ['failed'] });
    await runEvaluation(SESSION, { db, evaluate: async () => ok() });
    const text = logged.join('\n');
    for (const m of SAMPLE_TRANSCRIPT) expect(text).not.toContain(m.content);
    expect(text).not.toContain('Lucía');
    expect(text).not.toContain('Pregunta abierta');
  });
});
