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
    include: ['tests/unit/**/*.test.ts', 'tests/unit/**/*.test.tsx'],
    setupFiles: ['tests/unit/support/setup.ts'],
    restoreMocks: true,
  },
});
