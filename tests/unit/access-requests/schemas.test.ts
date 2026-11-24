import { describe, expect, it } from 'vitest';
import {
  discardAccessRequestSchema,
  submitAccessRequestSchema,
} from '@/features/access-requests/schemas';

const valid = {
  fullName: 'Nadia Nueva',
  email: '  Nadia@Ejemplo.TEST ',
  companyOrRole: 'Inmobiliaria Sur',
  message: 'Quiero practicar.',
  acceptPrivacy: 'on',
  privacyDocumentId: '00000000-0000-4000-c000-000000000003',
  website: '',
  startedAt: `1764000000000.${'a'.repeat(43)}`,
};

describe('submitAccessRequestSchema', () => {
  it('accepts a valid request and normalizes the email', () => {
    const parsed = submitAccessRequestSchema.parse(valid);
    expect(parsed.email).toBe('nadia@ejemplo.test');
    expect(parsed.acceptPrivacy).toBe(true);
  });
  it('makes empty optional fields undefined', () => {
    const parsed = submitAccessRequestSchema.parse({ ...valid, companyOrRole: '  ', message: '' });
    expect(parsed.companyOrRole).toBeUndefined();
    expect(parsed.message).toBeUndefined();
  });
  it('validates field lengths', () => {
    for (const patch of [
      { fullName: '   ' },
      { fullName: 'x'.repeat(81) },
      { email: 'no-es-correo' },
      { companyOrRole: 'x'.repeat(121) },
      { message: 'x'.repeat(501) },
    ]) {
      expect(submitAccessRequestSchema.safeParse({ ...valid, ...patch }).success).toBe(false);
    }
    expect(
      submitAccessRequestSchema.safeParse({ ...valid, message: 'x'.repeat(500) }).success,
    ).toBe(true);
  });
  it('requires accepting the privacy policy', () => {
    const result = submitAccessRequestSchema.safeParse({ ...valid, acceptPrivacy: undefined });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['acceptPrivacy']);
  });
  it('requires an empty honeypot', () => {
    expect(
      submitAccessRequestSchema.safeParse({ ...valid, website: 'https://spam.example' }).success,
    ).toBe(false);
    expect(submitAccessRequestSchema.safeParse({ ...valid, website: undefined }).success).toBe(
      false,
    );
  });
  it('requires a signed startedAt (format only; signature and ≥ 3 s are checked on the server)', () => {
    for (const startedAt of ['', '1764000000000', 'abc.def', `1764000000000.${'a'.repeat(10)}`]) {
      expect(submitAccessRequestSchema.safeParse({ ...valid, startedAt }).success).toBe(false);
    }
  });
  it('rejects a missing or non-uuid privacyDocumentId', () => {
    expect(
      submitAccessRequestSchema.safeParse({ ...valid, privacyDocumentId: undefined }).success,
    ).toBe(false);
    expect(
      submitAccessRequestSchema.safeParse({ ...valid, privacyDocumentId: 'privacy-v1' }).success,
    ).toBe(false);
  });
});

describe('discardAccessRequestSchema', () => {
  it('requires a uuid', () => {
    expect(
      discardAccessRequestSchema.safeParse({
        accessRequestId: '00000000-0000-4000-f000-000000000001',
      }).success,
    ).toBe(true);
    expect(discardAccessRequestSchema.safeParse({ accessRequestId: '42' }).success).toBe(false);
  });
});
