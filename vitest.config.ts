import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const src = fileURLToPath(new URL('./src/', import.meta.url));
const serverOnlyStub = fileURLToPath(
  new URL('./tests/unit/support/server-only.ts', import.meta.url),
);

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@\//, replacement: src },
      // `server-only` throws outside a React Server environment; unit tests run in plain Node.
      { find: /^server-only$/, replacement: serverOnlyStub },
    ],
  },
  esbuild: { jsx: 'automatic' },
  test: {
    environment: 'node',
    // The golden dataset runs offline (recorded outputs) in every CI run; the live variant needs a
    // real Gemini key and runs only with `pnpm test:golden` (vitest.golden.config.ts, golden.yml).
    include: [
      'tests/unit/**/*.test.ts',
      'tests/unit/**/*.test.tsx',
      'tests/golden/offline.test.ts',
    ],
    exclude: ['tests/golden/live.test.ts', 'node_modules/**'],
    setupFiles: ['tests/unit/support/setup.ts'],
    restoreMocks: true,
  },
});
