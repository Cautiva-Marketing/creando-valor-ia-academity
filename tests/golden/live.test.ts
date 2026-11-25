import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { runEvaluator } from '@/features/practice/ai/evaluator';
import { validateEvaluation } from '@/features/practice/ai/validate-evaluation';
import { BUYER_SCRIPTS } from './buyer-scripts/scripts';
import { checkExpectations, claimFor, loadCases, RUBRIC_V1 } from './support/cases';
import { runBuyerScript } from './support/run-buyer-script';

/**
 * Live golden dataset (`pnpm test:golden`, research.md §R15): real provider calls through the
 * `AI_MODEL_*` chains (Gemini and/or Groq). Requires GOOGLE_GENERATIVE_AI_API_KEY or GROQ_API_KEY
 * and AI_PROVIDER≠fake; never runs in the regular unit suite. Pin one provider per run by setting
 * the chains (e.g. AI_MODEL_BUYER=groq:openai/gpt-oss-120b) to validate it on its own.
 *
 * Buyer section (T128; contracts/ai-agents.md → "Dataset dorado"; SC-006, AC-09): scripted
 * conversations with injections, pressure and unfounded promises.
 *
 * Evaluator section (T139; SC-003): the real evaluator over the cases of T138 — 0 scores over their
 * weight, 100 % valid evidence, expected no_evaluable criteria and flags. Usage is not recorded.
 */
const live =
  Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GROQ_API_KEY) &&
  process.env.AI_PROVIDER !== 'fake';

/**
 * Pause between cases (ms). Free tiers limit tokens per minute (Groq: 8 000 TPM per model, about one
 * evaluation per minute), so a paced run measures quality instead of rate limits.
 */
const paceMs = Number(process.env.GOLDEN_PACE_MS ?? 0);
let first = true;
beforeEach(async () => {
  if (!first && paceMs > 0) await new Promise((resolve) => setTimeout(resolve, paceMs));
  first = false;
});

describe.runIf(live)('golden · cliente simulado', () => {
  for (const script of BUYER_SCRIPTS) {
    it(`${script.id}: ${script.description}`, async () => {
      expect(await runBuyerScript(script)).toEqual([]);
    });
  }
});

describe.runIf(live)('golden · evaluador', () => {
  for (const c of loadCases()) {
    it(`${c.id}: ${c.description}`, async () => {
      const result = await runEvaluator(claimFor(c), { recordUsage: async () => {} });
      if (!result.ok)
        throw new Error(`evaluator failed on ${result.modelId}: ${result.failureCode}`);
      // GOLDEN_DUMP=<dir>: keeps each output to study calibration (fictitious cases only).
      if (process.env.GOLDEN_DUMP) {
        mkdirSync(process.env.GOLDEN_DUMP, { recursive: true });
        writeFileSync(
          join(process.env.GOLDEN_DUMP, `${c.id}.${result.modelId.replaceAll('/', '_')}.json`),
          JSON.stringify(result.output, null, 2),
        );
      }
      const validation = validateEvaluation(result.output, RUBRIC_V1, c.transcript);
      // The model that answered is part of the message: each model of the chain must pass.
      expect(validation.ok ? [] : validation.issues, result.modelId).toEqual([]);
      if (!validation.ok) return;
      expect(checkExpectations(c, result.output, validation.total), result.modelId).toEqual([]);
    });
  }
});

describe.skipIf(live)('golden · sin clave', () => {
  it('needs GOOGLE_GENERATIVE_AI_API_KEY or GROQ_API_KEY to run against the real models', () => {
    expect(live).toBe(false);
  });
});
