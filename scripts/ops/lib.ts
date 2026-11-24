import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../src/lib/supabase/database.types';

/**
 * Shared helpers for operations scripts. Configuration comes ONLY from the process environment
 * (e.g. `pnpm tsx --env-file=.env.production scripts/ops/...`): no implicit file, so a script can never
 * silently target the wrong project.
 */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Falta la variable ${name}. Consulta scripts/ops/README.md.`);
    process.exit(2);
  }
  return value;
}

export function adminClient(): SupabaseClient<Database> {
  return createClient<Database>(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('SUPABASE_SECRET_KEY'),
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

/** Target host only (never keys), so the operator can confirm the project. */
export function targetLabel(): string {
  return new URL(requireEnv('NEXT_PUBLIC_SUPABASE_URL')).host;
}
