import { describe, expect, it } from 'vitest';
import { buildEvaluatorPrompt } from '@/features/practice/ai/evaluator-input';
import { evaluationOutputSchema, type EvaluationOutput } from '@/features/practice/ai/schemas';
import { validateEvaluation } from '@/features/practice/ai/validate-evaluation';
import { computeTotal } from '@/features/practice/domain/scoring';
import { checkExpectations, claimFor, loadCases, loadRecorded, RUBRIC_V1 } from './support/cases';

/**
 * Offline golden dataset (T138; blocking in CI): the recorded evaluator outputs pass the schema,
 * validateEvaluation and the case expectations; the total is always recalculated (SC-003: no score
 * over its weight, 100 % valid evidence). Rejection cases mutate the recordings.
 */
const cases = loadCases();

describe('golden · cobertura (FR-059)', () => {
  it('≥ 10 cases, ≥ 4 sectors, difficulties 1–5 and the required situations', () => {
    expect(cases.length).toBeGreaterThanOrEqual(10);
    expect(new Set(cases.map((c) => c.scenario.product.sector)).size).toBeGreaterThanOrEqual(4);
    expect(new Set(cases.map((c) => c.session.difficulty))).toEqual(new Set([1, 2, 3, 4, 5]));
    expect(cases.some((c) => c.transcript.filter((m) => m.author === 'seller').length === 1)).toBe(
      true,
    );
    expect(cases.some((c) => c.expect.noEvaluable.length > 0)).toBe(true);
    expect(cases.some((c) => c.expect.flags.includes('unfounded_promise'))).toBe(true);
    expect(cases.some((c) => c.expect.flags.includes('undue_pressure'))).toBe(true);
    expect(cases.some((c) => c.transcript.some((m) => /ignora la rúbrica/i.test(m.content)))).toBe(
      true,
    );
    expect(cases.some((c) => /EVALUADOR:/.test(c.scenario.product.description ?? ''))).toBe(true);
  });

  it('the rubric file is rubric v1 (weights add up to 100)', () => {
    expect(RUBRIC_V1.version).toBe('1.0');
    expect(RUBRIC_V1.criteria.reduce((sum, c) => sum + c.weight, 0)).toBe(100);
  });
});

describe.each(cases.map((c) => [c.id, c] as const))('golden · %s', (_id, c) => {
  const recorded = loadRecorded(c.id);
  const claim = claimFor(c);

  it('the evaluator input fits the prompt cap and neutralizes injected delimiters', () => {
    const { prompt } = buildEvaluatorPrompt(claim);
    expect(prompt.match(/<\/escenario>/g)).toHaveLength(1);
    expect(prompt).not.toContain('</datos_producto>');
  });

  it('recorded output passes the schema and validateEvaluation', () => {
    expect(evaluationOutputSchema.safeParse(recorded).success).toBe(true);
    const validation = validateEvaluation(recorded, RUBRIC_V1, c.transcript);
    expect(validation.ok ? [] : validation.issues).toEqual([]);
  });

  it('no score over its weight and evidence only from seller messages (SC-003)', () => {
    const sellerIds = new Set(
      c.transcript.filter((m) => m.author === 'seller').map((m) => `m${m.seq}`),
    );
    const weights = new Map(RUBRIC_V1.criteria.map((k) => [k.key, k.weight]));
    for (const criterion of recorded.criteria) {
      expect(criterion.score ?? 0).toBeLessThanOrEqual(weights.get(criterion.criterion_id)!);
      for (const id of criterion.evidence_message_ids) expect(sellerIds.has(id)).toBe(true);
    }
    for (const flag of recorded.ethical_flags) {
      for (const id of flag.message_ids) expect(sellerIds.has(id)).toBe(true);
    }
  });

  it('meets the case expectations; the total is recalculated', () => {
    const validation = validateEvaluation(recorded, RUBRIC_V1, c.transcript);
    if (!validation.ok) throw new Error(validation.issues.join(', '));
    const total = computeTotal(
      validation.payload.criteria.map((k) => ({
        status: k.status,
        score: k.score,
        maxScore: k.max_score,
      })),
    );
    expect(validation.total).toBe(total);
    expect(checkExpectations(c, recorded, total)).toEqual([]);
  });
});

describe('golden · casos de rechazo', () => {
  const c = cases[0]!;
  const recorded = () => structuredClone(loadRecorded(c.id)) as EvaluationOutput;
  const issuesOf = (output: EvaluationOutput) => {
    const result = validateEvaluation(output, RUBRIC_V1, c.transcript);
    return result.ok ? [] : result.issues;
  };

  it('score over the weight', () => {
    const o = recorded();
    o.criteria[0]!.score = o.criteria[0]!.max_score + 1;
    expect(issuesOf(o)).toContain('score_range');
  });

  it('evidence from a buyer message or a nonexistent one', () => {
    const o = recorded();
    o.criteria[1]!.evidence_message_ids = ['m1'];
    expect(issuesOf(o)).toContain('evidence_invalid');
    o.criteria[1]!.evidence_message_ids = ['m999'];
    expect(issuesOf(o)).toContain('evidence_invalid');
  });

  it('a missing criterion, a wrong max or an unknown rubric version', () => {
    const o = recorded();
    o.criteria.pop();
    o.criteria[0]!.max_score = 99;
    o.rubric_version = '2.0';
    expect(issuesOf(o)).toEqual(
      expect.arrayContaining(['criteria_missing', 'max_score', 'rubric_version']),
    );
  });

  it('a proposed total of 100 is ignored', () => {
    const o = recorded();
    o.total_score = 100;
    const result = validateEvaluation(o, RUBRIC_V1, c.transcript);
    expect(result.ok && result.total).not.toBe(100);
  });
});
