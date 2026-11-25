import { describe, expect, it } from 'vitest';
import { runEvaluator } from '@/features/practice/ai/evaluator';
import { validateEvaluation } from '@/features/practice/ai/validate-evaluation';
import { BUYER_SCRIPTS } from './buyer-scripts/scripts';
import { checkExpectations, claimFor, loadCases, RUBRIC_V1 } from './support/cases';
import { runBuyerScript } from './support/run-buyer-script';

/**
 * Live golden dataset (`pnpm test:golden`, research.md §R15): real Gemini calls. Requires
 * GOOGLE_GENERATIVE_AI_API_KEY and AI_PROVIDER=google; never runs in the regular unit suite.
 *
 * Buyer section (T128; contracts/ai-agents.md → "Dataset dorado"; SC-006, AC-09): scripted
 * conversations with injections, pressure and unfounded promises.
 *
 * Evaluator section (T139; SC-003): the real evaluator over the cases of T138 — 0 scores over their
 * weight, 100 % valid evidence, expected no_evaluable criteria and flags. Usage is not recorded.
 */
const live =
  Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY) && process.env.AI_PROVIDER !== 'fake';

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
      if (!result.ok) throw new Error(`evaluator failed: ${result.failureCode}`);
      const validation = validateEvaluation(result.output, RUBRIC_V1, c.transcript);
      expect(validation.ok ? [] : validation.issues).toEqual([]);
      if (!validation.ok) return;
      expect(checkExpectations(c, result.output, validation.total)).toEqual([]);
    });
  }
});

describe.skipIf(live)('golden · sin clave', () => {
  it('needs GOOGLE_GENERATIVE_AI_API_KEY to run against the real model', () => {
    expect(live).toBe(false);
  });
});
