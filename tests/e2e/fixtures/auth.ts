import { createServerClient } from '@supabase/ssr';
import type { BrowserContext } from '@playwright/test';
import type { Database } from '../../../src/lib/supabase/database.types';
import { testEnv } from './env';
import { SEED_PASSWORD, SEED_TOTP_SECRET, SEED_USERS } from './seed-data';
import { freshTotp } from './totp';

/**
 * Programmatic sign-in: uses @supabase/ssr exactly like the app, captures the session cookies and
 * hands them to the browser context. The seed users are only READ (a new session per sign-in).
 */
export interface Credentials {
  email: string;
  password: string;
  /** TOTP secret + factor id to elevate the session to aal2. */
  totp?: { secret: string; factorId: string };
}

export const SEED_LOGINS = {
  vendedorA: { email: SEED_USERS.vendedorA.email, password: SEED_PASSWORD },
  vendedorB: { email: SEED_USERS.vendedorB.email, password: SEED_PASSWORD },
  vendedorC: { email: SEED_USERS.vendedorC.email, password: SEED_PASSWORD },
  vendedorD: { email: SEED_USERS.vendedorD.email, password: SEED_PASSWORD },
  vendedorE: { email: SEED_USERS.vendedorE.email, password: SEED_PASSWORD },
  superadminAal1: { email: SEED_USERS.superadmin.email, password: SEED_PASSWORD },
  superadmin: {
    email: SEED_USERS.superadmin.email,
    password: SEED_PASSWORD,
    totp: { secret: SEED_TOTP_SECRET, factorId: SEED_USERS.superadmin.factorId },
  },
  superadminSinFactor: { email: SEED_USERS.superadminSinFactor.email, password: SEED_PASSWORD },
} satisfies Record<string, Credentials>;

export type SeedLogin = keyof typeof SEED_LOGINS;

export async function sessionCookies(
  credentials: Credentials,
): Promise<{ name: string; value: string }[]> {
  const jar = new Map<string, string>();
  const client = createServerClient<Database>(
    testEnv('NEXT_PUBLIC_SUPABASE_URL'),
    testEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'),
    {
      cookies: {
        getAll: () => [...jar].map(([name, value]) => ({ name, value })),
        setAll: (cookies) => {
          for (const { name, value } of cookies) {
            if (value) jar.set(name, value);
            else jar.delete(name);
          }
        },
      },
    },
  );
  const { error } = await client.auth.signInWithPassword({
    email: credentials.email,
    password: credentials.password,
  });
  if (error) throw new Error(`sign-in failed for e2e user: ${error.message}`);
  if (credentials.totp) {
    const code = await freshTotp(credentials.totp.secret);
    const verified = await client.auth.mfa.challengeAndVerify({
      factorId: credentials.totp.factorId,
      code,
    });
    if (verified.error) throw new Error(`MFA verify failed: ${verified.error.message}`);
  }
  // Cookie writes happen in the auth state listener; give it a tick.
  for (let i = 0; i < 20 && jar.size === 0; i++) await new Promise((r) => setTimeout(r, 25));
  await client.auth.getSession();
  return [...jar].map(([name, value]) => ({ name, value }));
}

/** Access token stored in @supabase/ssr cookies (`base64-` + JSON, possibly chunked `.0`, `.1`…). */
export function accessTokenFrom(cookies: { name: string; value: string }[]): string {
  const auth = cookies
    .filter((c) => /-auth-token(\.\d+)?$/.test(c.name))
    .sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }))
    .map((c) => c.value)
    .join('');
  const json = auth.startsWith('base64-')
    ? Buffer.from(auth.slice(7), 'base64url').toString('utf8')
    : auth;
  return (JSON.parse(json) as { access_token: string }).access_token;
}

/** Signs the browser context in (seed user name or explicit credentials). */
export async function signIn(
  context: BrowserContext,
  who: SeedLogin | Credentials,
  baseURL?: string,
): Promise<void> {
  const credentials = typeof who === 'string' ? SEED_LOGINS[who] : who;
  const url = new URL(baseURL ?? process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000');
  const cookies = await sessionCookies(credentials);
  await context.addCookies(
    cookies.map(({ name, value }) => ({
      name,
      value,
      domain: url.hostname,
      path: '/',
      httpOnly: false,
      secure: url.protocol === 'https:',
      sameSite: 'Lax' as const,
    })),
  );
}
