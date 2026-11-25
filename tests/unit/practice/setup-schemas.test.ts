import { describe, expect, it } from 'vitest';
import {
  practicarQuerySchema,
  practiceSetupSchema,
  sessionIdSchema,
} from '@/features/practice/schemas';

/** T071 (contracts/server-actions.md → configurePractice; contracts/routes.md → /practicar). */

const A = '00000000-0000-4000-9300-000000000a11';
const B = '00000000-0000-4000-9300-000000000a12';
const C = '00000000-0000-4000-9300-000000000a13';
const D = '00000000-0000-4000-9300-000000000a14';

const base = {
  productId: '00000000-0000-4000-9100-000000000a01',
  objectionIds: [A],
  difficulty: '3',
  hintsEnabled: 'on',
  focusStage: '',
  idempotencyKey: '00000000-0000-4000-8000-00000000f001',
};

describe('practiceSetupSchema', () => {
  it('parses a valid form', () => {
    expect(practiceSetupSchema.parse(base)).toEqual({
      productId: base.productId,
      objectionIds: [A],
      difficulty: 3,
      hintsEnabled: true,
      focusStage: null,
      idempotencyKey: base.idempotencyKey,
    });
  });

  it('accepts 1 to 3 objections and rejects 0, 4 and duplicates', () => {
    expect(practiceSetupSchema.safeParse({ ...base, objectionIds: [A, B, C] }).success).toBe(true);
    expect(practiceSetupSchema.safeParse({ ...base, objectionIds: [] }).success).toBe(false);
    expect(practiceSetupSchema.safeParse({ ...base, objectionIds: [A, B, C, D] }).success).toBe(
      false,
    );
    const dup = practiceSetupSchema.safeParse({ ...base, objectionIds: [A, A] });
    expect(dup.success).toBe(false);
    expect(dup.error?.issues[0]?.path).toEqual(['objectionIds']);
  });

  it('rejects difficulty 0 and 6', () => {
    expect(practiceSetupSchema.safeParse({ ...base, difficulty: '0' }).success).toBe(false);
    expect(practiceSetupSchema.safeParse({ ...base, difficulty: '6' }).success).toBe(false);
    expect(practiceSetupSchema.safeParse({ ...base, difficulty: '2.5' }).success).toBe(false);
  });

  it('reads the hints switch: absent → false', () => {
    expect(practiceSetupSchema.parse({ ...base, hintsEnabled: undefined }).hintsEnabled).toBe(
      false,
    );
    expect(practiceSetupSchema.parse({ ...base, hintsEnabled: 'true' }).hintsEnabled).toBe(true);
  });

  it('accepts a Cautiva focus stage and rejects an unknown one', () => {
    expect(practiceSetupSchema.parse({ ...base, focusStage: 'innova' }).focusStage).toBe('innova');
    expect(practiceSetupSchema.safeParse({ ...base, focusStage: 'cierra' }).success).toBe(false);
  });

  it('requires uuids', () => {
    expect(practiceSetupSchema.safeParse({ ...base, productId: 'x' }).success).toBe(false);
    expect(practiceSetupSchema.safeParse({ ...base, idempotencyKey: '' }).success).toBe(false);
  });
});

describe('practicarQuerySchema', () => {
  it('keeps valid parameters', () => {
    expect(
      practicarQuerySchema.parse({
        producto: base.productId,
        foco: 'conoce',
        aviso: 'configuracion-cambiada',
      }),
    ).toEqual({ producto: base.productId, foco: 'conoce', aviso: 'configuracion-cambiada' });
  });

  it('ignores invalid parameters instead of failing', () => {
    expect(practicarQuerySchema.parse({ producto: '../x', foco: 'nope', aviso: 'otro' })).toEqual(
      {},
    );
    expect(practicarQuerySchema.parse({ producto: [base.productId, base.productId] })).toEqual({});
    expect(practicarQuerySchema.parse({})).toEqual({});
  });
});

describe('sessionIdSchema', () => {
  it('requires a uuid', () => {
    expect(sessionIdSchema.safeParse({ sessionId: base.productId }).success).toBe(true);
    expect(sessionIdSchema.safeParse({ sessionId: '1' }).success).toBe(false);
  });
});
