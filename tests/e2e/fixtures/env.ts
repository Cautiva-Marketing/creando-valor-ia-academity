import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Loads `.env.local` into process.env for test-side helpers (existing variables win). */
const envFile = fileURLToPath(new URL('../../../.env.local', import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);

export function testEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name} for e2e tests (see .env.example)`);
  return value;
}
