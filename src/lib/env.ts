import 'server-only';
import { z } from 'zod';

/**
 * Server-only configuration (research.md §R22). Never import from a Client Component.
 *
 * `E2E_EMAIL_FAIL_DOMAIN` is a test-only switch. It is rejected on Vercel production and on any
 * production build unless the process was started by the e2e suite (`E2E=1`), because the e2e
 * webServer runs `next start`, which always sets NODE_ENV=production.
 */
const serverSchema = z
  .object({
    SUPABASE_SECRET_KEY: z.string().min(1),
    SEND_EMAIL_HOOK_SECRET: z.string().startsWith('v1,whsec_'),
    SMTP_HOST: z.string().min(1),
    SMTP_PORT: z.coerce.number().int().positive(),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    EMAIL_FROM: z.string().min(3),
    RATE_LIMIT_PEPPER: z.string().min(16),
    SENTRY_DSN: z.string().optional(),
    E2E_EMAIL_FAIL_DOMAIN: z.string().optional(),
    NODE_ENV: z.string().optional(),
    VERCEL_ENV: z.string().optional(),
    E2E: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    if (!env.E2E_EMAIL_FAIL_DOMAIN) return;
    const isVercelProduction = env.VERCEL_ENV === 'production';
    const isUnflaggedProduction = env.NODE_ENV === 'production' && env.E2E !== '1';
    if (isVercelProduction || isUnflaggedProduction) {
      ctx.addIssue({
        code: 'custom',
        path: ['E2E_EMAIL_FAIL_DOMAIN'],
        message: 'E2E_EMAIL_FAIL_DOMAIN is test-only and must not be set in production',
      });
    }
  });

export type ServerEnv = z.infer<typeof serverSchema>;

let cached: ServerEnv | undefined;

export function serverEnv(): ServerEnv {
  cached ??= serverSchema.parse({
    ...process.env,
    SMTP_USER: process.env.SMTP_USER || undefined,
    SMTP_PASS: process.env.SMTP_PASS || undefined,
    SENTRY_DSN: process.env.SENTRY_DSN || undefined,
    E2E_EMAIL_FAIL_DOMAIN: process.env.E2E_EMAIL_FAIL_DOMAIN || undefined,
  });
  return cached;
}

/** For unit tests only: validates an arbitrary environment without caching. */
export function parseServerEnv(env: Record<string, string | undefined>): ServerEnv {
  return serverSchema.parse(env);
}
