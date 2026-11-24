import { describe, expect, it } from 'vitest';
import {
  convertibleRequestParam,
  createInvitationSchema,
  listInvitationsSchema,
  resendInvitationSchema,
  revokeInvitationSchema,
} from '@/features/invitations/schemas';

const key = '3f1c2a4e-8b7d-4c3a-9e2f-1a2b3c4d5e6f';
const id = '0b5a1c2d-3e4f-4a5b-8c6d-7e8f9a0b1c2d';

describe('createInvitationSchema (data-model.md invitations.email / expires_in_days / idempotency_key)', () => {
  it('normalizes the email and defaults the expiry to 7 days', () => {
    expect(
      createInvitationSchema.parse({ email: '  Ana@Ejemplo.PE ', idempotencyKey: key }),
    ).toEqual({
      email: 'ana@ejemplo.pe',
      expiresInDays: 7,
      idempotencyKey: key,
    });
  });
  it('accepts 1..30 days (as form strings) and rejects the rest', () => {
    expect(
      createInvitationSchema.parse({ email: 'a@b.pe', expiresInDays: '30', idempotencyKey: key })
        .expiresInDays,
    ).toBe(30);
    expect(
      createInvitationSchema.parse({ email: 'a@b.pe', expiresInDays: '1', idempotencyKey: key })
        .expiresInDays,
    ).toBe(1);
    for (const bad of ['0', '31', '2.5', 'siete']) {
      expect(
        createInvitationSchema.safeParse({
          email: 'a@b.pe',
          expiresInDays: bad,
          idempotencyKey: key,
        }).success,
      ).toBe(false);
    }
  });
  it('requires a uuid idempotency key and accepts an optional access request id', () => {
    expect(createInvitationSchema.safeParse({ email: 'a@b.pe' }).success).toBe(false);
    expect(createInvitationSchema.safeParse({ email: 'a@b.pe', idempotencyKey: 'x' }).success).toBe(
      false,
    );
    expect(
      createInvitationSchema.parse({ email: 'a@b.pe', idempotencyKey: key, accessRequestId: id })
        .accessRequestId,
    ).toBe(id);
    expect(
      createInvitationSchema.safeParse({
        email: 'a@b.pe',
        idempotencyKey: key,
        accessRequestId: 'x',
      }).success,
    ).toBe(false);
  });
  it('rejects invalid emails', () => {
    expect(
      createInvitationSchema.safeParse({ email: 'no-es-correo', idempotencyKey: key }).success,
    ).toBe(false);
  });
});

describe('resendInvitationSchema', () => {
  it('requires uuid invitationId and idempotencyKey', () => {
    expect(resendInvitationSchema.parse({ invitationId: id, idempotencyKey: key })).toEqual({
      invitationId: id,
      idempotencyKey: key,
    });
    expect(
      resendInvitationSchema.safeParse({ invitationId: 'x', idempotencyKey: key }).success,
    ).toBe(false);
    expect(
      resendInvitationSchema.safeParse({ invitationId: id, idempotencyKey: 'x' }).success,
    ).toBe(false);
    expect(resendInvitationSchema.safeParse({ invitationId: id }).success).toBe(false);
  });
});

describe('revokeInvitationSchema', () => {
  it('requires a uuid invitationId (idempotent by state, no key)', () => {
    expect(revokeInvitationSchema.parse({ invitationId: id })).toEqual({ invitationId: id });
    expect(revokeInvitationSchema.safeParse({ invitationId: 'abc' }).success).toBe(false);
  });
});

describe('convertibleRequestParam (?solicitud)', () => {
  it('accepts a uuid and rejects anything else', () => {
    expect(convertibleRequestParam.safeParse(id).success).toBe(true);
    for (const bad of ['', 'abc', `${id}x`, '../admin'])
      expect(convertibleRequestParam.safeParse(bad).success).toBe(false);
  });
});

describe('listInvitationsSchema', () => {
  it('keeps valid filters and drops unknown status values', () => {
    expect(listInvitationsSchema.parse({ estado: 'pending', q: ' ana ', pagina: '2' })).toEqual({
      status: 'pending',
      q: 'ana',
      page: 2,
    });
    expect(listInvitationsSchema.parse({ estado: 'pendiente', pagina: '-3' })).toEqual({ page: 1 });
  });
});
