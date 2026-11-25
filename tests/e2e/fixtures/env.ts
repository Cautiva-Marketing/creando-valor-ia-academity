import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Loads `.env.test.local` (local stack values) and then `.env.local` into process.env for test-side
 * helpers. Existing variables win, so the test file takes precedence over `.env.local`.
 */
for (const name of ['.env.test.local', '.env.local']) {
  const envFile = fileURLToPath(new URL(`../../../${name}`, import.meta.url));
  if (existsSync(envFile)) process.loadEnvFile(envFile);
}

export function testEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name} for e2e tests (see .env.example)`);
  // Factories write with the secret key: never let them reach a remote (production) project.
  if (name === 'NEXT_PUBLIC_SUPABASE_URL') {
    const host = new URL(value).hostname;
    if (!['127.0.0.1', 'localhost', 'host.docker.internal'].includes(host)) {
      throw new Error(
        `e2e helpers only run against the local Supabase stack (got host ${host}). ` +
          'Set NEXT_PUBLIC_SUPABASE_URL/SUPABASE_SECRET_KEY to the values of `pnpm supabase status`.',
      );
    }
  }
  return value;
}
