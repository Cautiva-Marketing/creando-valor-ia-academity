import { describe, expect, it, vi } from 'vitest';

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));

const { fail, fromPostgresError, mapPostgresCode, ok, rateLimited, retryMessage, unexpected } =
  await import('@/lib/action-result');
const Sentry = await import('@sentry/nextjs');

describe('mapPostgresCode (contracts/database-rpc.md)', () => {
  it.each([
    ['42501', 'forbidden'],
    ['P0002', 'not_found'],
    ['P0010', 'conflict'],
    ['P0011', 'invitation_invalid'],
    ['P0012', 'conflict'],
    ['23514', 'validation'],
    ['22023', 'validation'],
    ['23505', 'conflict'],
    ['P0020', 'quota_exhausted'],
    ['P0021', 'setup_limit'],
    ['P0022', 'active_session'],
    ['XX000', 'unexpected'],
    [undefined, 'unexpected'],
  ])('%s → %s', (code, expected) => {
    expect(mapPostgresCode(code)).toBe(expected);
  });
});

describe('ActionResult helpers', () => {
  it('ok wraps data', () => {
    expect(ok({ id: 1 })).toEqual({ ok: true, data: { id: 1 } });
  });

  it('fail uses the Spanish catalog and never the original error', () => {
    const result = fromPostgresError({ code: '42501', message: 'permission denied for table x' });
    expect(result).toMatchObject({ ok: false, code: 'forbidden' });
    expect(result.message).not.toContain('permission denied');
  });

  it('unexpected errors get a reference id and go to Sentry', () => {
    const result = unexpected(new Error('boom: secret detail'));
    expect(result.code).toBe('unexpected');
    expect(result.referenceId).toMatch(/^[0-9A-F]{8}$/);
    expect(result.message).toContain(result.referenceId!);
    expect(result.message).not.toContain('secret detail');
    expect(Sentry.captureException).toHaveBeenCalled();
  });

  it('rate limited messages tell the minutes to retry', () => {
    expect(retryMessage(12 * 60)).toBe('Demasiados intentos. Vuelve a intentarlo en 12 minutos.');
    expect(retryMessage(30)).toBe('Demasiados intentos. Vuelve a intentarlo en 1 minuto.');
    expect(rateLimited(61)).toMatchObject({ code: 'rate_limited', retryAfterSeconds: 61 });
  });

  it('fail accepts field errors and values', () => {
    expect(
      fail('validation', { fieldErrors: { email: ['x'] }, values: { email: 'a' } }),
    ).toMatchObject({
      fieldErrors: { email: ['x'] },
      values: { email: 'a' },
    });
  });
});

describe('practice error details (002 contracts/database-rpc.md)', () => {
  it('quota exhausted carries the scope and renewal date', () => {
    expect(
      fromPostgresError({ code: 'P0020', details: 'daily:2026-11-25T05:00:00+00:00' }),
    ).toMatchObject({
      code: 'quota_exhausted',
      message: 'Alcanzaste tu límite de simulaciones.',
      details: { scope: 'daily', renewsAt: '2026-11-25T05:00:00.000Z' },
    });
    expect(fromPostgresError({ code: 'P0020', details: 'disabled' })).toMatchObject({
      details: { scope: 'disabled' },
    });
  });

  it('setup limit carries the reason and retry date', () => {
    expect(
      fromPostgresError({ code: 'P0021', details: 'failure:2026-11-25T05:00:00Z' }),
    ).toMatchObject({
      code: 'setup_limit',
      details: { reason: 'failure', retryAt: '2026-11-25T05:00:00.000Z' },
    });
  });

  it('active session carries the session id', () => {
    const sessionId = '00000000-0000-4000-9000-000000000a01';
    expect(fromPostgresError({ code: 'P0022', details: sessionId })).toMatchObject({
      code: 'active_session',
      message: 'Tienes una práctica en curso.',
      details: { sessionId },
    });
  });

  it('conflict carries a whitelisted reason only', () => {
    expect(fromPostgresError({ code: 'P0010', details: 'expired' })).toMatchObject({
      code: 'conflict',
      details: { reason: 'expired' },
    });
    expect(
      fromPostgresError({ code: 'P0010', details: 'secret internals' }).details,
    ).toBeUndefined();
  });

  it('malformed details are dropped instead of leaking', () => {
    expect(
      fromPostgresError({ code: 'P0020', details: 'weekly:tomorrow' }).details,
    ).toBeUndefined();
    expect(fromPostgresError({ code: 'P0022', details: 'not-a-uuid' }).details).toBeUndefined();
  });

  it('ai_unavailable has its own copy', () => {
    expect(fail('ai_unavailable').message).toBe(
      'No pudimos preparar a tu comprador. Inténtalo de nuevo.',
    );
  });
});
