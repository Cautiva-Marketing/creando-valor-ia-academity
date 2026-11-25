import { computeTotal, levelFor, type ScoreLevel } from '../domain/scoring';
import type { CautivaStage } from '../domain/cautiva';
import type { EvaluationOutput } from './schemas';

/**
 * First validation layer of the evaluation (research.md §R9, FR-040, AC-04). Pure: the same rules run
 * again in `save_practice_evaluation`. Converts "mN" ids into `seq` and recalculates the total with
 * `computeTotal`; the total proposed by the model is ignored (FR-041).
 */
export interface RubricForValidation {
  version: string;
  criteria: ReadonlyArray<{ key: string; weight: number; stages?: readonly CautivaStage[] }>;
}

export interface TranscriptMessage {
  seq: number;
  author: 'seller' | 'buyer';
  content: string;
}

export type EvaluationIssue =
  | 'rubric_version'
  | 'criteria_missing'
  | 'criteria_duplicate'
  | 'criteria_unknown'
  | 'max_score'
  | 'score_range'
  | 'score_on_no_evaluable'
  | 'evidence_missing'
  | 'evidence_invalid'
  | 'flag_evidence_invalid';

/** Payload of save_practice_evaluation (snake_case, as the SQL reads it). */
export interface EvaluationPayload {
  criteria: Array<{
    key: string;
    status: 'evaluated' | 'no_evaluable';
    score: number | null;
    max_score: number;
    evidence_seqs: number[];
    justification: string;
    improvement: string;
    confidence: number;
  }>;
  total_score: number | null;
  strengths: string[];
  improvements: string[];
  suggested_drill_text: string;
  suggested_drill_stage: CautivaStage;
  ethical_flags: Array<{
    type: EvaluationOutput['ethical_flags'][number]['type'];
    explanation: string;
    message_seqs: number[];
  }>;
}

export type EvaluationValidation =
  | { ok: true; payload: EvaluationPayload; total: number | null; level: ScoreLevel | null }
  | { ok: false; issues: EvaluationIssue[] };

const MESSAGE_ID = /^m([1-9]\d{0,5})$/;

/** "m12" → 12 when it is a seller message of the transcript; otherwise null. */
function sellerSeq(id: string, sellerSeqs: ReadonlySet<number>): number | null {
  const match = MESSAGE_ID.exec(id.trim());
  if (!match) return null;
  const seq = Number(match[1]);
  return sellerSeqs.has(seq) ? seq : null;
}

function toSeqs(ids: readonly string[], sellerSeqs: ReadonlySet<number>): number[] | null {
  const seqs: number[] = [];
  for (const id of ids) {
    const seq = sellerSeq(id, sellerSeqs);
    if (seq === null) return null;
    if (!seqs.includes(seq)) seqs.push(seq);
  }
  return seqs;
}

export function validateEvaluation(
  output: EvaluationOutput,
  rubric: RubricForValidation,
  transcript: readonly TranscriptMessage[],
): EvaluationValidation {
  const issues = new Set<EvaluationIssue>();
  const sellerSeqs = new Set(transcript.filter((m) => m.author === 'seller').map((m) => m.seq));
  const weights = new Map(rubric.criteria.map((c) => [c.key, c.weight]));

  if (output.rubric_version.trim() !== rubric.version) issues.add('rubric_version');

  const seen = new Set<string>();
  const criteria: EvaluationPayload['criteria'] = [];
  for (const c of output.criteria) {
    const key = c.criterion_id.trim();
    const weight = weights.get(key);
    if (weight === undefined) {
      issues.add('criteria_unknown');
      continue;
    }
    if (seen.has(key)) issues.add('criteria_duplicate');
    seen.add(key);
    if (c.max_score !== weight) issues.add('max_score');

    const seqs = toSeqs(c.evidence_message_ids, sellerSeqs);
    if (seqs === null) issues.add('evidence_invalid');

    if (c.status === 'evaluated') {
      if (c.score === null || !Number.isInteger(c.score) || c.score < 0 || c.score > weight) {
        issues.add('score_range');
      }
      if (c.evidence_message_ids.length === 0) issues.add('evidence_missing');
    } else if (c.score !== null) {
      issues.add('score_on_no_evaluable');
    }

    criteria.push({
      key,
      status: c.status,
      score: c.status === 'evaluated' ? c.score : null,
      max_score: weight,
      evidence_seqs: seqs ?? [],
      justification: c.justification.trim(),
      improvement: c.improvement.trim(),
      confidence: Math.round(c.confidence * 100) / 100,
    });
  }
  if (rubric.criteria.some((c) => !seen.has(c.key))) issues.add('criteria_missing');

  const flags: EvaluationPayload['ethical_flags'] = [];
  for (const flag of output.ethical_flags) {
    const seqs = toSeqs(flag.message_ids, sellerSeqs);
    if (seqs === null || seqs.length === 0) {
      issues.add('flag_evidence_invalid');
      continue;
    }
    flags.push({ type: flag.type, explanation: flag.explanation.trim(), message_seqs: seqs });
  }

  if (issues.size > 0) return { ok: false, issues: [...issues] };

  const total = computeTotal(
    criteria.map((c) => ({ status: c.status, score: c.score, maxScore: c.max_score })),
  );
  return {
    ok: true,
    total,
    level: levelFor(total),
    payload: {
      criteria,
      total_score: total,
      strengths: output.strengths.map((s) => s.trim()),
      improvements: output.improvements.map((s) => s.trim()),
      suggested_drill_text: output.suggested_drill.text.trim(),
      suggested_drill_stage: output.suggested_drill.stage,
      ethical_flags: flags,
    },
  };
}
