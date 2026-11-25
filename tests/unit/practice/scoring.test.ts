import { describe, expect, it } from 'vitest';
import {
  computeTotal,
  confidenceLabel,
  levelFor,
  stageAverages,
  type ScoredCriterion,
} from '@/features/practice/domain/scoring';
import cases from '../../fixtures/practice/scoring-cases.json';

/** T033 (FR-041, FR-042, FR-046, data-model.md → Cálculos). Same table as the pgTAP suite. */

type CaseCriterion = { status: string; score: number | null; max: number; stages?: string[] };

function toScored(c: CaseCriterion): ScoredCriterion {
  return {
    status: c.status as ScoredCriterion['status'],
    score: c.score,
    maxScore: c.max,
    stages: (c.stages ?? []) as ScoredCriterion['stages'],
  };
}

describe('computeTotal and levelFor', () => {
  it.each(cases.totals.map((c) => [c.name, c] as const))('%s', (_name, c) => {
    const total = computeTotal(c.criteria.map(toScored));
    expect(total).toBe(c.total);
    expect(levelFor(total)).toBe(c.level);
  });
});

describe('stageAverages', () => {
  it.each(cases.stages.map((c) => [c.name, c] as const))('%s', (_name, c) => {
    expect(stageAverages(c.criteria.map(toScored))).toEqual(c.expected);
  });
});

describe('confidenceLabel (FR-046)', () => {
  it.each([
    [1, 'Alta'],
    [0.75, 'Alta'],
    [0.749, 'Media'],
    [0.5, 'Media'],
    [0.49, 'Baja'],
    [0, 'Baja'],
  ])('%s → %s', (value, label) => {
    expect(confidenceLabel(value)).toBe(label);
  });
});
