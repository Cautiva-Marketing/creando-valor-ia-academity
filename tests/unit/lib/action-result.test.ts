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
