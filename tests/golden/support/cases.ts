import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { EvaluationClaim } from '@/features/practice/ai/evaluator-input';
import type { EvaluationOutput } from '@/features/practice/ai/schemas';

/**
 * Golden dataset of the evaluator (T138; contracts/ai-agents.md → "Dataset dorado"; FR-059, SC-003).
 * `cases/NN-<slug>.json`: scenario + transcript + expectations; `recorded/NN-<slug>.eval.json`: the
 * evaluator output checked offline in CI. `rubric-v1.json` holds the published rubric texts.
 */
export interface GoldenCase {
  id: string;
  description: string;
  session: Pick<EvaluationClaim['session'], 'difficulty' | 'focusStage' | 'endReason'>;
  scenario: EvaluationClaim['scenario'];
  transcript: EvaluationClaim['transcript'];
  expect: {
    /** [min, max] per evaluated criterion. */
    criteria: Record<string, [number, number]>;
    noEvaluable: string[];
    flags: Array<'unfounded_promise' | 'undue_pressure'>;
    /** Injection cases: the total must stay at or under this value. */
    injection?: { totalMax: number };
  };
}

const ROOT = fileURLToPath(new URL('..', import.meta.url));

const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T;

export const RUBRIC_V1 = readJson<EvaluationClaim['rubric']>(
  join(ROOT, 'support', 'rubric-v1.json'),
);

export function loadCases(): GoldenCase[] {
  return readdirSync(join(ROOT, 'cases'))
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => readJson<GoldenCase>(join(ROOT, 'cases', name)));
}

export function loadRecorded(id: string): EvaluationOutput {
  return readJson<EvaluationOutput>(join(ROOT, 'recorded', `${id}.eval.json`));
}

/** The claim `claim_practice_evaluation` would return for this case (fictitious ids). */
export function claimFor(c: GoldenCase): EvaluationClaim {
  return {
    session: {
      id: '00000000-0000-4000-9000-00000000a0a0',
      organizationId: '00000000-0000-4000-b000-00000000a0a0',
      userId: '00000000-0000-4000-a000-00000000a0a0',
      attempt: 1,
      dueAt: new Date(Date.now() + 3 * 60_000).toISOString(),
      ...c.session,
    },
    scenario: c.scenario,
    rubric: RUBRIC_V1,
    transcript: c.transcript,
  };
}

/** Problems of an evaluation against the case expectations (empty = pass). */
export function checkExpectations(
  c: GoldenCase,
  output: EvaluationOutput,
  total: number | null,
): string[] {
  const problems: string[] = [];
  for (const criterion of output.criteria) {
    const key = criterion.criterion_id;
    if (c.expect.noEvaluable.includes(key)) {
      if (criterion.status !== 'no_evaluable') problems.push(`${key}: expected no_evaluable`);
      continue;
    }
    const range = c.expect.criteria[key];
    if (!range) continue;
    if (criterion.status !== 'evaluated' || criterion.score === null) {
      problems.push(`${key}: expected a score in [${range.join(', ')}]`);
    } else if (criterion.score < range[0] || criterion.score > range[1]) {
      problems.push(`${key}: ${criterion.score} outside [${range.join(', ')}]`);
    }
  }
  const flags = new Set(output.ethical_flags.map((f) => f.type));
  for (const flag of c.expect.flags) {
    if (!flags.has(flag)) problems.push(`missing flag ${flag}`);
  }
  for (const flag of flags) {
    if (!c.expect.flags.includes(flag)) problems.push(`unexpected flag ${flag}`);
  }
  if (c.expect.injection && total !== null && total > c.expect.injection.totalMax) {
    problems.push(`injection: total ${total} > ${c.expect.injection.totalMax}`);
  }
  return problems;
}
