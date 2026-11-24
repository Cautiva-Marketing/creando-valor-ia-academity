import { beforeEach, describe, expect, it, vi } from 'vitest';
import { retryMessage } from '@/lib/action-result';
import { RATE_LIMITS, clientIpFrom } from '@/lib/security/rate-limit-config';

const consumeRateLimit = vi.fn();
const getRequestContext = vi.fn();

vi.mock('@/lib/security/rate-limit', () => ({ consumeRateLimit }));
vi.mock('@/lib/auth/request-context', () => ({ getRequestContext }));
vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    throw new Error('redirect');
  }),
  forbidden: vi.fn(() => {
    throw new Error('forbidden');
  }),
}));
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));
const supabaseSignOut = vi.fn(async () => ({ error: null }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { signOut: supabaseSignOut } })),
}));

const guards = await import('@/lib/auth/guards');
const authActions = await import('@/features/auth/actions');

describe('rate limit table matches research.md §R9', () => {
  it.each([
    ['login_account', 5, 15 * 60, 15 * 60],
    ['login_ip', 20, 15 * 60, 15 * 60],
    ['mfa_verify', 5, 15 * 60, 15 * 60],
    ['recovery_email', 3, 3600, null],
    ['activation_ip', 10, 3600, null],
    ['access_request_ip', 3, 3600, null],
    ['webhook_id', 1, 24 * 3600, 24 * 3600],
    ['user_mutation', 60, 60, 60],
  ] as const)('%s: %d per %ds, lockout %s', (scope, max, windowSeconds, lockoutSeconds) => {
    expect(RATE_LIMITS[scope]).toEqual({ max, windowSeconds, lockoutSeconds });
  });

  it('has exactly the eight scopes of the database CHECK', () => {
    expect(Object.keys(RATE_LIMITS).sort()).toEqual(
      [
        'access_request_ip',
        'activation_ip',
        'login_account',
        'login_ip',
        'mfa_verify',
        'recovery_email',
        'user_mutation',
        'webhook_id',
      ].sort(),
    );
  });
});

describe('retry message', () => {
  it('rounds up to whole minutes', () => {
    expect(retryMessage(14 * 60 + 1)).toContain('15 minutos');
    expect(retryMessage(1)).toContain('1 minuto');
  });
});

describe('client IP', () => {
  it('prefers x-real-ip, then the first x-forwarded-for', () => {
    expect(
      clientIpFrom(new Headers({ 'x-real-ip': '1.1.1.1', 'x-forwarded-for': '2.2.2.2' })),
    ).toBe('1.1.1.1');
    expect(clientIpFrom(new Headers({ 'x-forwarded-for': '3.3.3.3, 10.0.0.1' }))).toBe('3.3.3.3');
    expect(clientIpFrom(new Headers())).toBe('unknown');
  });
});

describe('server action guards apply user_mutation before returning the context', () => {
  const ctx = {
    user_id: 'user-1',
    email: 'a@b.test',
    full_name: 'A',
    timezone: 'America/Lima',
    session_ok: true,
    aal: 'aal2',
    is_superadmin_account: true,
    has_verified_factor: true,
    onboarding_status: 'completed',
    onboarding_step: 3,
    memberships: [],
  };

  beforeEach(() => {
    consumeRateLimit.mockReset();
    getRequestContext.mockReset();
  });

  it('authenticateAction consumes user_mutation indexed by user_id', async () => {
    getRequestContext.mockResolvedValue(ctx);
    consumeRateLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: 0 });
    const result = await guards.authenticateAction();
    expect(consumeRateLimit).toHaveBeenCalledWith('user_mutation', 'user-1');
    expect(result).toMatchObject({ ok: true });
  });

  it('returns rate_limited when user_mutation is exhausted', async () => {
    getRequestContext.mockResolvedValue(ctx);
    consumeRateLimit.mockResolvedValue({ allowed: false, retryAfterSeconds: 40 });
    const result = await guards.actionRequireSuperadmin();
    expect(result).toMatchObject({ ok: false, code: 'rate_limited', retryAfterSeconds: 40 });
  });

  it('does not touch the rate limit without a session', async () => {
    getRequestContext.mockResolvedValue(null);
    const result = await guards.authenticateAction();
    expect(result).toMatchObject({ ok: false, code: 'unauthorized' });
    expect(consumeRateLimit).not.toHaveBeenCalled();
  });

  it('resetPassword consumes user_mutation before doing anything else', async () => {
    getRequestContext.mockResolvedValue(ctx);
    consumeRateLimit.mockResolvedValue({ allowed: false, retryAfterSeconds: 30 });
    const form = new FormData();
    form.set('password', 'Cierre-Consultivo-77');
    expect(await authActions.resetPassword(null, form)).toMatchObject({
      ok: false,
      code: 'rate_limited',
    });
    expect(consumeRateLimit).toHaveBeenCalledWith('user_mutation', 'user-1');
  });

  it('signOut never consults the rate limit', async () => {
    getRequestContext.mockResolvedValue(ctx);
    await expect(authActions.signOut()).rejects.toThrow('redirect');
    expect(supabaseSignOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(consumeRateLimit).not.toHaveBeenCalled();
  });

  it('superadmin guard rejects aal1 after the rate limit', async () => {
    getRequestContext.mockResolvedValue({ ...ctx, aal: 'aal1' });
    consumeRateLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: 0 });
    expect(await guards.actionRequireSuperadmin()).toMatchObject({ ok: false, code: 'forbidden' });
    expect(consumeRateLimit).toHaveBeenCalledTimes(1);
  });
});
