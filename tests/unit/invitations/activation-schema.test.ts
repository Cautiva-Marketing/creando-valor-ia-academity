import { describe, expect, it } from 'vitest';
import {
  activateAccountSchema,
  invitationTokenParam,
} from '@/features/invitations/activation-schema';

const token = 'A'.repeat(20) + '_-' + 'b9'.repeat(10) + 'z'; // 43 chars
const terms = '00000000-0000-4000-c000-000000000001';
const ai = '00000000-0000-4000-c000-000000000002';
const valid = {
  token,
  fullName: '  Ñandú Pérez ',
  password: 'Una-Clave-Larga-2026',
  acceptTerms: 'on',
  acceptAiNotice: 'on',
  termsDocumentId: terms,
  aiNoticeDocumentId: ai,
};

describe('invitationTokenParam (route [token])', () => {
  it('accepts exactly 43 base64url characters', () => {
    expect(token).toHaveLength(43);
    expect(invitationTokenParam.safeParse(token).success).toBe(true);
  });
  it('rejects other lengths and non-base64url characters', () => {
    for (const bad of [
      '',
      token.slice(1),
      `${token}a`,
      `${token.slice(1)}+`,
      `${token.slice(1)}/`,
      `${token.slice(1)}=`,
      `${token.slice(1)}.`,
    ]) {
      expect(invitationTokenParam.safeParse(bad).success).toBe(false);
    }
  });
});

describe('activateAccountSchema (contracts/server-actions.md → activateAccount)', () => {
  it('parses a valid submission (trimmed name, checkboxes as true)', () => {
    expect(activateAccountSchema.parse(valid)).toEqual({
      ...valid,
      fullName: 'Ñandú Pérez',
      acceptTerms: true,
      acceptAiNotice: true,
    });
  });
  it('requires a name of 1..80 characters that is not only spaces', () => {
    expect(activateAccountSchema.safeParse({ ...valid, fullName: '    ' }).success).toBe(false);
    expect(activateAccountSchema.safeParse({ ...valid, fullName: '' }).success).toBe(false);
    expect(activateAccountSchema.safeParse({ ...valid, fullName: 'x'.repeat(81) }).success).toBe(
      false,
    );
    expect(activateAccountSchema.safeParse({ ...valid, fullName: 'x'.repeat(80) }).success).toBe(
      true,
    );
  });
  it('requires both checkboxes checked', () => {
    for (const key of ['acceptTerms', 'acceptAiNotice'] as const) {
      expect(activateAccountSchema.safeParse({ ...valid, [key]: undefined }).success).toBe(false);
      expect(activateAccountSchema.safeParse({ ...valid, [key]: 'off' }).success).toBe(false);
      expect(activateAccountSchema.safeParse({ ...valid, [key]: '' }).success).toBe(false);
    }
  });
  it('requires both legal document ids as uuids', () => {
    for (const key of ['termsDocumentId', 'aiNoticeDocumentId'] as const) {
      expect(activateAccountSchema.safeParse({ ...valid, [key]: undefined }).success).toBe(false);
      expect(activateAccountSchema.safeParse({ ...valid, [key]: 'abc' }).success).toBe(false);
    }
  });
  it('rejects a tampered token', () => {
    expect(activateAccountSchema.safeParse({ ...valid, token: 'corto' }).success).toBe(false);
  });
  it('enforces the password length bounds', () => {
    expect(activateAccountSchema.safeParse({ ...valid, password: 'corta' }).success).toBe(false);
  });
});
