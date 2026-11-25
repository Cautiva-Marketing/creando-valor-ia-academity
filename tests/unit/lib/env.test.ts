import { describe, expect, it } from 'vitest';
import { parseAiEnv, parseDispatchEnv, parseServerEnv } from '@/lib/env';

const baseServer = {
  SUPABASE_SECRET_KEY: 'sb_secret_test',
  SEND_EMAIL_HOOK_SECRET: 'v1,whsec_abc',
  SMTP_HOST: '127.0.0.1',
  SMTP_PORT: '54325',
  EMAIL_FROM: 'Test <a@b.test>',
  RATE_LIMIT_PEPPER: 'pepper-pepper-pepper-pepper',
};

describe('serverEnv', () => {
  it('rejects E2E_EMAIL_FAIL_DOMAIN in production', () => {
    expect(() =>
      parseServerEnv({ ...baseServer, E2E_EMAIL_FAIL_DOMAIN: 'x.test', NODE_ENV: 'production' }),
    ).toThrow();
  });
});

describe('aiEnv (002 research.md §R2)', () => {
  it('defaults to google and requires the API key', () => {
    expect(() => parseAiEnv({})).toThrow(/GOOGLE_GENERATIVE_AI_API_KEY/);
    const env = parseAiEnv({ GOOGLE_GENERATIVE_AI_API_KEY: 'AIza-test' });
    expect(env.AI_PROVIDER).toBe('google');
    expect(env.AI_MODEL_BUYER).toBeTruthy();
    expect(env.AI_MODEL_BUYER_SETUP).toBeTruthy();
    expect(env.AI_MODEL_EVALUATOR).toBeTruthy();
  });

  it('treats empty strings as unset', () => {
    expect(() => parseAiEnv({ AI_PROVIDER: '', GOOGLE_GENERATIVE_AI_API_KEY: '' })).toThrow();
  });

  it('accepts the fake provider outside production without a key', () => {
    expect(parseAiEnv({ AI_PROVIDER: 'fake', NODE_ENV: 'development' }).AI_PROVIDER).toBe('fake');
    expect(parseAiEnv({ AI_PROVIDER: 'fake', NODE_ENV: 'production', E2E: '1' }).AI_PROVIDER).toBe(
      'fake',
    );
  });

  it('rejects the fake provider in production', () => {
    expect(() => parseAiEnv({ AI_PROVIDER: 'fake', NODE_ENV: 'production' })).toThrow(
      /AI_PROVIDER/,
    );
    expect(() =>
      parseAiEnv({
        AI_PROVIDER: 'fake',
        NODE_ENV: 'production',
        E2E: '1',
        VERCEL_ENV: 'production',
      }),
    ).toThrow(/AI_PROVIDER/);
  });

  it('rejects unknown providers', () => {
    expect(() =>
      parseAiEnv({ AI_PROVIDER: 'openai', GOOGLE_GENERATIVE_AI_API_KEY: 'k' }),
    ).toThrow();
  });
});

describe('dispatchEnv', () => {
  it('requires a secret of at least 32 bytes', () => {
    expect(() => parseDispatchEnv({})).toThrow();
    expect(() => parseDispatchEnv({ PRACTICE_DISPATCH_SECRET: 'short' })).toThrow(/32 bytes/);
    expect(
      parseDispatchEnv({ PRACTICE_DISPATCH_SECRET: 'x'.repeat(32) }).PRACTICE_DISPATCH_SECRET,
    ).toHaveLength(32);
  });
});
