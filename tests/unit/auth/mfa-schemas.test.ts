import { describe, expect, it } from 'vitest';
import { confirmMfaEnrollmentSchema, verifyMfaSchema } from '@/features/auth/mfa-schemas';

const factorId = '00000000-0000-4000-d000-000000000001';

describe('MFA schemas (contracts/server-actions.md, Principio II)', () => {
  it('accepts a 6-digit code, a uuid factor and an internal next', () => {
    expect(confirmMfaEnrollmentSchema.parse({ factorId, code: '012345' })).toEqual({
      factorId,
      code: '012345',
    });
    expect(verifyMfaSchema.parse({ code: '987654', next: '/admin/consumo' })).toEqual({
      code: '987654',
      next: '/admin/consumo',
    });
    expect(verifyMfaSchema.parse({ code: '987654' }).next).toBeUndefined();
  });

  it.each(['12345', '1234567', '12a456', '123 456', ' 123456', '', '１２３４５６'])(
    'rejects code %j',
    (code) => {
      expect(verifyMfaSchema.safeParse({ code }).success).toBe(false);
      expect(confirmMfaEnrollmentSchema.safeParse({ factorId, code }).success).toBe(false);
    },
  );

  it.each(['no-es-uuid', '', '00000000-0000-4000-d000-00000000000'])(
    'rejects factorId %j',
    (bad) => {
      expect(confirmMfaEnrollmentSchema.safeParse({ factorId: bad, code: '123456' }).success).toBe(
        false,
      );
    },
  );

  it.each([
    'https://evil.example',
    '//evil.example',
    'javascript:alert(1)',
    '/\\evil.example',
    'admin',
  ])('rejects next %j', (next) => {
    expect(verifyMfaSchema.safeParse({ code: '123456', next }).success).toBe(false);
  });
});
