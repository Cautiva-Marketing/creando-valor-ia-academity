import { describe, expect, it } from 'vitest';
import { evaluationOutputSchema, type EvaluationOutput } from '@/features/practice/ai/schemas';
import {
  validateEvaluation,
  type RubricForValidation,
  type TranscriptMessage,
} from '@/features/practice/ai/validate-evaluation';

/** T134 — FR-040 rules over the schema and the transcript; the proposed total is ignored. */

const RUBRIC_V1: RubricForValidation = {
  version: '1.0',
  criteria: [
    { key: 'first_impression', weight: 10 },
    { key: 'diagnosis', weight: 20 },
    { key: 'active_listening', weight: 10 },
    { key: 'value_argument', weight: 20 },
    { key: 'objection_handling', weight: 15 },
    { key: 'negotiation_close', weight: 15 },
    { key: 'follow_up', weight: 10 },
  ],
};

const transcript: TranscriptMessage[] = [
  { seq: 1, author: 'buyer', content: 'Hola.' },
  { seq: 2, author: 'seller', content: 'Hola, ¿qué buscas?' },
  { seq: 3, author: 'buyer', content: 'Algo económico.' },
  { seq: 4, author: 'seller', content: 'Te ofrezco esto.' },
  { seq: 5, author: 'buyer', content: 'Lo pienso.' },
];

function output(overrides: Partial<EvaluationOutput> = {}): EvaluationOutput {
  return {
    rubric_version: '1.0',
    criteria: RUBRIC_V1.criteria.map((c) => ({
      criterion_id: c.key,
      status: 'evaluated' as const,
      score: c.weight - 2,
      max_score: c.weight,
      evidence_message_ids: ['m2'],
      justification: 'Lo hizo con claridad.',
      improvement: 'Pregunta más.',
      confidence: 0.8,
    })),
    total_score: 99,
    strengths: ['Saludo cordial'],
    improvements: ['Indagar el plazo'],
    suggested_drill: { text: 'Practica preguntas abiertas.', stage: 'conoce' },
    ethical_flags: [{ type: 'undue_pressure', explanation: 'Presionó.', message_ids: ['m4'] }],
    ...overrides,
  };
}

function withCriterion(index: number, patch: Partial<EvaluationOutput['criteria'][number]>) {
  const base = output();
  base.criteria[index] = { ...base.criteria[index]!, ...patch };
  return base;
}

describe('validateEvaluation', () => {
  it('accepts a valid evaluation, converts mN into seq and recalculates the total', () => {
    expect(evaluationOutputSchema.safeParse(output()).success).toBe(true);
    const result = validateEvaluation(output(), RUBRIC_V1, transcript);
    expect(result).toMatchObject({ ok: true, total: 86, level: 'competent' });
    if (!result.ok) return;
    expect(result.payload.total_score).toBe(86);
    expect(result.payload.criteria[0]).toMatchObject({
      key: 'first_impression',
      evidence_seqs: [2],
    });
    expect(result.payload.ethical_flags).toEqual([
      { type: 'undue_pressure', explanation: 'Presionó.', message_seqs: [4] },
    ]);
  });

  it('no_evaluable criteria renormalize the total (FR-041)', () => {
    const result = validateEvaluation(
      withCriterion(0, { status: 'no_evaluable', score: null, evidence_message_ids: [] }),
      RUBRIC_V1,
      transcript,
    );
    // (86 - 8) / 90 = 86.67 → 87
    expect(result).toMatchObject({ ok: true, total: 87 });
  });

  it.each([
    ['rubric_version', output({ rubric_version: '0.9' })],
    ['criteria_missing', output({ criteria: output().criteria.slice(0, 6) })],
    [
      'criteria_duplicate',
      output({ criteria: [...output().criteria.slice(0, 6), output().criteria[0]!] }),
    ],
    ['criteria_unknown', withCriterion(0, { criterion_id: 'rapport' })],
    ['max_score', withCriterion(0, { max_score: 11 })],
    ['score_range', withCriterion(0, { score: 11 })],
    ['score_range', withCriterion(0, { score: -1 })],
    ['score_range', withCriterion(0, { score: null })],
    ['score_on_no_evaluable', withCriterion(0, { status: 'no_evaluable', score: 4 })],
    ['evidence_missing', withCriterion(0, { evidence_message_ids: [] })],
    ['evidence_invalid', withCriterion(0, { evidence_message_ids: ['m3'] })],
    ['evidence_invalid', withCriterion(0, { evidence_message_ids: ['m99'] })],
    ['evidence_invalid', withCriterion(0, { evidence_message_ids: ['2'] })],
    [
      'flag_evidence_invalid',
      output({
        ethical_flags: [{ type: 'unfounded_promise', explanation: 'x', message_ids: ['m1'] }],
      }),
    ],
  ])('rejects %s', (issue, candidate) => {
    const result = validateEvaluation(candidate, RUBRIC_V1, transcript);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues).toContain(issue);
  });

  it('the proposed total never matters', () => {
    const a = validateEvaluation(output({ total_score: 0 }), RUBRIC_V1, transcript);
    const b = validateEvaluation(output({ total_score: null }), RUBRIC_V1, transcript);
    expect(a.ok && b.ok && a.total === b.total).toBe(true);
  });

  it('nothing evaluable → no total and no level', () => {
    const none = output({
      criteria: output().criteria.map((c) => ({
        ...c,
        status: 'no_evaluable' as const,
        score: null,
        evidence_message_ids: [],
      })),
    });
    expect(validateEvaluation(none, RUBRIC_V1, transcript)).toMatchObject({
      ok: true,
      total: null,
      level: null,
    });
  });

  it('schema rejects out-of-range lengths and flags without messages', () => {
    expect(
      evaluationOutputSchema.safeParse(output({ strengths: Array(6).fill('x') })).success,
    ).toBe(false);
    expect(
      evaluationOutputSchema.safeParse(
        output({ ethical_flags: [{ type: 'undue_pressure', explanation: 'x', message_ids: [] }] }),
      ).success,
    ).toBe(false);
    expect(evaluationOutputSchema.safeParse(withCriterion(0, { confidence: 1.2 })).success).toBe(
      false,
    );
  });
});
