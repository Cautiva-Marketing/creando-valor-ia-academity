import 'server-only';
import { z } from 'zod';
import { parseModelChain, PROVIDER_KEY_VARS, usableEntries, type ModelRef } from './ai/model-chain';

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

/**
 * AI configuration (002 research.md §R2). Parsed lazily and separately from `serverEnv()` so the
 * rest of the app keeps working where AI is not configured; it fails only when AI is used.
 *
 * `AI_PROVIDER=fake` is a test-only deterministic provider: like `E2E_EMAIL_FAIL_DOMAIN`, it is
 * rejected on Vercel production and on any production build not started by the e2e suite (`E2E=1`).
 * Model names are those verified on the Gemini free tier (research.md §R4, T003).
 */
const nonEmpty = (value: string | undefined) => (value && value.trim() !== '' ? value : undefined);

const aiSchema = z
  .object({
    AI_PROVIDER: z.enum(['google', 'fake']).default('google'),
    GOOGLE_GENERATIVE_AI_API_KEY: z.string().min(1).optional(),
    GROQ_API_KEY: z.string().min(1).optional(),
    // Model chains `provider:model,…` (src/lib/ai/model-chain.ts), tried in order on 429/5xx. Pilot
    // on free tiers (research.md §R16): Gemini streams the buyer turns; Groq (1 000 requests/day per
    // model) carries setup and evaluation, where Gemini allows only 20 per day.
    AI_MODEL_BUYER_SETUP: z
      .string()
      .min(1)
      .max(300)
      .default('groq:openai/gpt-oss-120b,google:gemini-3.6-flash'),
    AI_MODEL_BUYER: z
      .string()
      .min(1)
      .max(300)
      .default('google:gemini-3.5-flash-lite,groq:openai/gpt-oss-120b'),
    AI_MODEL_EVALUATOR: z
      .string()
      .min(1)
      .max(300)
      .default('groq:openai/gpt-oss-120b,google:gemini-3.6-flash'),
    NODE_ENV: z.string().optional(),
    VERCEL_ENV: z.string().optional(),
    E2E: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    if (env.AI_PROVIDER === 'fake') {
      const isVercelProduction = env.VERCEL_ENV === 'production';
      const isUnflaggedProduction = env.NODE_ENV === 'production' && env.E2E !== '1';
      if (isVercelProduction || isUnflaggedProduction) {
        ctx.addIssue({
          code: 'custom',
          path: ['AI_PROVIDER'],
          message: 'AI_PROVIDER=fake is test-only and must not be used in production',
        });
      }
      return;
    }
    // Real providers: every task needs at least one chain entry whose provider has a key.
    const keys = { google: env.GOOGLE_GENERATIVE_AI_API_KEY, groq: env.GROQ_API_KEY };
    for (const variable of [
      'AI_MODEL_BUYER_SETUP',
      'AI_MODEL_BUYER',
      'AI_MODEL_EVALUATOR',
    ] as const) {
      let chain: ModelRef[];
      try {
        chain = parseModelChain(env[variable]);
      } catch (error) {
        ctx.addIssue({
          code: 'custom',
          path: [variable],
          message: `${variable}: ${(error as Error).message}`,
        });
        continue;
      }
      if (usableEntries(chain, keys).length === 0) {
        const needed = [...new Set(chain.map((ref) => PROVIDER_KEY_VARS[ref.provider]))].join(
          ' or ',
        );
        ctx.addIssue({
          code: 'custom',
          path: [variable],
          message: `${variable} has no usable model: set ${needed}`,
        });
      }
    }
  });

export type AiEnv = z.infer<typeof aiSchema>;

let cachedAi: AiEnv | undefined;

function aiInput(env: Record<string, string | undefined>) {
  return {
    AI_PROVIDER: nonEmpty(env.AI_PROVIDER),
    GOOGLE_GENERATIVE_AI_API_KEY: nonEmpty(env.GOOGLE_GENERATIVE_AI_API_KEY),
    GROQ_API_KEY: nonEmpty(env.GROQ_API_KEY),
    AI_MODEL_BUYER_SETUP: nonEmpty(env.AI_MODEL_BUYER_SETUP),
    AI_MODEL_BUYER: nonEmpty(env.AI_MODEL_BUYER),
    AI_MODEL_EVALUATOR: nonEmpty(env.AI_MODEL_EVALUATOR),
    NODE_ENV: env.NODE_ENV,
    VERCEL_ENV: env.VERCEL_ENV,
    E2E: env.E2E,
  };
}

export function aiEnv(): AiEnv {
  cachedAi ??= aiSchema.parse(aiInput(process.env));
  return cachedAi;
}

/** For unit tests only. */
export function parseAiEnv(env: Record<string, string | undefined>): AiEnv {
  return aiSchema.parse(aiInput(env));
}

/**
 * Secret of the internal evaluation dispatcher (`pg_net` → `/api/internal/practice/evaluations`,
 * research.md §R8). At least 32 bytes; the same value lives in Vault (`practice_dispatch_secret`).
 */
const dispatchSchema = z.object({
  PRACTICE_DISPATCH_SECRET: z
    .string({ error: 'PRACTICE_DISPATCH_SECRET is required' })
    .refine((value) => Buffer.byteLength(value, 'utf8') >= 32, {
      message: 'PRACTICE_DISPATCH_SECRET must have at least 32 bytes',
    }),
});

export type DispatchEnv = z.infer<typeof dispatchSchema>;

let cachedDispatch: DispatchEnv | undefined;

export function dispatchEnv(): DispatchEnv {
  cachedDispatch ??= dispatchSchema.parse({
    PRACTICE_DISPATCH_SECRET: nonEmpty(process.env.PRACTICE_DISPATCH_SECRET),
  });
  return cachedDispatch;
}

/** For unit tests only. */
export function parseDispatchEnv(env: Record<string, string | undefined>): DispatchEnv {
  return dispatchSchema.parse({ PRACTICE_DISPATCH_SECRET: nonEmpty(env.PRACTICE_DISPATCH_SECRET) });
}
