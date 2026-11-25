import { defineConfig } from 'vitest/config';
import base from './vitest.config';

/**
 * Live golden dataset (002 research.md §R15): real evaluator and scripted buyer conversations
 * against Gemini. Requires GOOGLE_GENERATIVE_AI_API_KEY; consumes the shared free-tier quota, so it
 * runs sequentially with generous timeouts and only via `pnpm test:golden` / golden.yml.
 *
 * Spread (not mergeConfig): mergeConfig concatenates arrays, which would keep the unit `include`
 * and, worse, the base `exclude` of live.test.ts, so the live suite would never run.
 */
export default defineConfig({
  ...base,
  test: {
    ...base.test,
    include: ['tests/golden/offline.test.ts', 'tests/golden/live.test.ts'],
    exclude: ['node_modules/**'],
    testTimeout: 180_000,
    hookTimeout: 120_000,
    fileParallelism: false,
    sequence: { concurrent: false },
  },
});
