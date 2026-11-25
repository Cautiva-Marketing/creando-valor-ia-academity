import type { Database } from '@/lib/supabase/database.types';
import { CAUTIVA_STAGES, type CautivaStage } from './cautiva';

/**
 * Evaluation calculations (data-model.md → "Cálculos", FR-041, FR-042, FR-046). Identical in SQL;
 * both use tests/fixtures/practice/scoring-cases.json.
 */
export type ScoreLevel = Database['public']['Enums']['score_level'];

export interface ScoredCriterion {
  status: Database['public']['Enums']['criterion_status'];
  score: number | null;
  maxScore: number;
  stages?: readonly CautivaStage[];
}

/** round-half-up(100 · a / b) for non-negative integers, without floating point drift. */
function percent(numerator: number, denominator: number): number {
  return Math.floor((200 * numerator + denominator) / (2 * denominator));
}

function evaluated(criteria: readonly ScoredCriterion[]) {
  return criteria.filter(
    (c): c is ScoredCriterion & { score: number } => c.status === 'evaluated' && c.score !== null,
  );
}

/** Σ score / Σ max of the evaluated criteria, as 0–100; null when nothing was evaluable. */
export function computeTotal(criteria: readonly ScoredCriterion[]): number | null {
  const scored = evaluated(criteria);
  const max = scored.reduce((sum, c) => sum + c.maxScore, 0);
  if (scored.length === 0 || max === 0) return null;
  return percent(
    scored.reduce((sum, c) => sum + c.score, 0),
    max,
  );
}

export function levelFor(total: number | null): ScoreLevel | null {
  if (total === null) return null;
  if (total >= 90) return 'advanced';
  if (total >= 75) return 'competent';
  if (total >= 60) return 'developing';
  return 'reinforcement';
}

/**
 * Average of score/max (0–100) of the evaluated criteria of each stage. A criterion shared by two
 * stages counts for both; a stage without evaluated criteria has no data (null).
 */
export function stageAverages(
  criteria: readonly ScoredCriterion[],
): Record<CautivaStage, number | null> {
  const scored = evaluated(criteria);
  const result = {} as Record<CautivaStage, number | null>;
  for (const stage of CAUTIVA_STAGES) {
    const ofStage = scored.filter((c) => c.stages?.includes(stage));
    result[stage] =
      ofStage.length === 0
        ? null
        : Math.round(
            (100 * ofStage.reduce((sum, c) => sum + c.score / c.maxScore, 0)) / ofStage.length,
          );
  }
  return result;
}

/** FR-046: Alta ≥ 0,75 · Media ≥ 0,5 · Baja < 0,5. */
export function confidenceLabel(confidence: number): 'Alta' | 'Media' | 'Baja' {
  if (confidence >= 0.75) return 'Alta';
  if (confidence >= 0.5) return 'Media';
  return 'Baja';
}
