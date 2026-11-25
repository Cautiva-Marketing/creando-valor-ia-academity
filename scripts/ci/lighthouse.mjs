#!/usr/bin/env node
/**
 * Lighthouse CI (SC-007, SC-008; 002 T191): mobile profile on the landing, /iniciar-sesion and the
 * seller pages /inicio ("Hoy"), /productos, /historial and the result of the seeded evaluated session
 * of seller A (supabase/seed.sql → "002 · Seller practice"). Seller pages need a session: seller A
 * signs in with @supabase/ssr (same cookie format as the app) and that cookie is sent only on the
 * authenticated run (an additive collect), so the public pages are measured as an anonymous visitor.
 * Same budgets as 001 (lighthouserc.json: performance ≥ 0.9, accessibility 1, LCP < 2.5 s, CLS < 0.1).
 *
 * Requires a running production server (`pnpm build && pnpm start`) and the local Supabase stack with
 * the seed. Env: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, LHCI_BASE_URL
 * (default http://localhost:3000).
 */
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { createServerClient } from '@supabase/ssr';

const require = createRequire(import.meta.url);
const lhci = require.resolve('@lhci/cli/src/cli.js');
const base = (process.env.LHCI_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');

// Seed credentials (supabase/seed.sql; local/CI only, never a real account).
const SEED_SELLER = { email: 'vendedor.a@ejemplo.test', password: 'Semilla-Segura-2026' };
/** Evaluated session of seller A in the seed (tests/e2e/fixtures/seed-data.ts → SEED_PRACTICE). */
const SEED_EVALUATED_SESSION = '00000000-0000-4000-9000-000000000a01';
const SELLER_PAGES = [
  '/inicio',
  '/productos',
  '/historial',
  `/practicas/${SEED_EVALUATED_SESSION}`,
];

function run(args) {
  execFileSync(process.execPath, [lhci, ...args], { stdio: 'inherit' });
}

async function sessionCookieHeader() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key)
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are required',
    );
  let cookies = [];
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => cookies.map(({ name, value }) => ({ name, value })),
      setAll: (next) => {
        const byName = new Map(cookies.map((c) => [c.name, c]));
        for (const cookie of next) byName.set(cookie.name, cookie);
        cookies = [...byName.values()].filter((c) => c.value);
      },
    },
  });
  const { error } = await supabase.auth.signInWithPassword(SEED_SELLER);
  if (error) throw new Error(`seed sign-in failed: ${error.message}`);
  if (cookies.length === 0) throw new Error('no session cookie was produced');
  return cookies.map(({ name, value }) => `${name}=${value}`).join('; ');
}

run(['collect', `--url=${base}/`, `--url=${base}/iniciar-sesion`]);
const cookie = await sessionCookieHeader();
run([
  'collect',
  '--additive',
  ...SELLER_PAGES.map((path) => `--url=${base}${path}`),
  `--settings.extraHeaders=${JSON.stringify({ Cookie: cookie })}`,
]);
run(['assert']);
run(['upload']);
