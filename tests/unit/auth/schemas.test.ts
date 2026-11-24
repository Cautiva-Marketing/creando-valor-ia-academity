import { describe, expect, it } from 'vitest';
import {
  authConfirmParams,
  requestPasswordResetSchema,
  resetPasswordSchema,
  signInSchema,
} from '@/features/auth/schemas';

describe('signInSchema (contracts/server-actions.md)', () => {
  it('normalizes the email and keeps an internal next', () => {
    const result = signInSchema.parse({
      email: '  Ana@Ejemplo.TEST ',
      password: 'x',
      next: '/perfil',
    });
    expect(result).toEqual({ email: 'ana@ejemplo.test', password: 'x', next: '/perfil' });
  });
  it('drops an external next instead of failing', () => {
    expect(
      signInSchema.parse({ email: 'a@b.test', password: 'x', next: 'https://evil.example' }).next,
    ).toBeUndefined();
    expect(
      signInSchema.parse({ email: 'a@b.test', password: 'x', next: '//evil.example' }).next,
    ).toBeUndefined();
  });
  it('requires a valid email and a password of 1..200', () => {
    expect(signInSchema.safeParse({ email: 'no-es-correo', password: 'x' }).success).toBe(false);
    expect(signInSchema.safeParse({ email: 'a@b.test', password: '' }).success).toBe(false);
    expect(signInSchema.safeParse({ email: 'a@b.test', password: 'x'.repeat(201) }).success).toBe(
      false,
    );
  });
});

describe('requestPasswordResetSchema', () => {
  it('normalizes and validates the email', () => {
    expect(requestPasswordResetSchema.parse({ email: ' X@Y.Test' })).toEqual({ email: 'x@y.test' });
    expect(requestPasswordResetSchema.safeParse({ email: '' }).success).toBe(false);
  });
});

describe('resetPasswordSchema', () => {
  it('requires at least 10 and at most 200 characters', () => {
    expect(resetPasswordSchema.safeParse({ password: 'corta' }).success).toBe(false);
    expect(resetPasswordSchema.safeParse({ password: 'x'.repeat(201) }).success).toBe(false);
    expect(resetPasswordSchema.safeParse({ password: 'Cierre-Consultivo-77' }).success).toBe(true);
  });
});

describe('authConfirmParams (/auth/confirm query)', () => {
  const valid = {
    token_hash: 'pkce_abcDEF123-_',
    type: 'recovery',
    next: '/restablecer-contrasena',
  };

  it('accepts a recovery link', () => {
    expect(authConfirmParams.parse(valid)).toEqual(valid);
    expect(authConfirmParams.parse({ token_hash: 'abc', type: 'recovery' }).next).toBeUndefined();
  });
  it.each([
    ['type signup', { ...valid, type: 'signup' }],
    ['type magiclink', { ...valid, type: 'magiclink' }],
    ['token_hash with dots', { ...valid, token_hash: 'abc.def' }],
    ['token_hash with spaces', { ...valid, token_hash: 'abc def' }],
    ['token_hash too long', { ...valid, token_hash: 'a'.repeat(257) }],
    ['empty token_hash', { ...valid, token_hash: '' }],
    ['external next', { ...valid, next: 'https://evil.example' }],
    ['protocol-relative next', { ...valid, next: '//evil.example' }],
  ])('rejects %s', (_label, params) => {
    expect(authConfirmParams.safeParse(params).success).toBe(false);
  });
});
