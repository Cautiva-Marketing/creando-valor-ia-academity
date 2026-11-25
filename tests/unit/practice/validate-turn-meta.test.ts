import { describe, expect, it } from 'vitest';
import {
  projectTurn,
  validateTurnMeta,
  type TurnContext,
} from '@/features/practice/ai/validate-turn-meta';

/** T094 (research.md §R4; FR-027, FR-028, FR-034): mirror of private.apply_turn_rules. */

const ctx: TurnContext = {
  interest: 45,
  sellerMessageCount: 5,
  revealableKeys: ['budget', 'timeline', 'decision_maker'],
  revealedKeys: ['budget'],
  hiddenIds: ['h1'],
  raisedHiddenIds: [],
};

const output = (meta: Record<string, unknown>, reply = 'Mmm, cuéntame más.') => ({
  reply,
  meta: {
    interest_delta: 0,
    revealed: [],
    hidden_objection_raised: null,
    seller_abusive: false,
    end: false,
    end_reason: null,
    ...meta,
  },
});

describe('validateTurnMeta', () => {
  it('accepts valid metadata as is', () => {
    const result = validateTurnMeta(
      output({ interest_delta: 8, revealed: ['timeline'], hidden_objection_raised: 'h1' }),
      ctx,
    );
    expect(result).toMatchObject({
      ok: true,
      status: 'valid',
      meta: { interest_delta: 8, revealed: ['timeline'], hidden_objection_raised: 'h1' },
      projection: { interestAfter: 53, endReason: null },
    });
  });

  it('clamps the interest change to ±15 → corrected', () => {
    const result = validateTurnMeta(output({ interest_delta: 40 }), ctx);
    expect(result).toMatchObject({ ok: true, status: 'corrected', meta: { interest_delta: 15 } });
  });

  it('drops keys already revealed and hidden objections that do not exist or were raised', () => {
    expect(
      validateTurnMeta(output({ revealed: ['budget', 'timeline', 'timeline'] }), ctx),
    ).toMatchObject({ ok: true, status: 'corrected', meta: { revealed: ['timeline'] } });
    expect(validateTurnMeta(output({ hidden_objection_raised: 'h2' }), ctx)).toMatchObject({
      ok: true,
      status: 'corrected',
      meta: { hidden_objection_raised: null },
    });
    expect(
      validateTurnMeta(output({ hidden_objection_raised: 'h1' }), {
        ...ctx,
        raisedHiddenIds: ['h1'],
      }),
    ).toMatchObject({ status: 'corrected', meta: { hidden_objection_raised: null } });
  });

  it('ignores goal_achieved below 80', () => {
    const below = validateTurnMeta(
      output({ interest_delta: 10, end: true, end_reason: 'goal_achieved' }),
      { ...ctx, interest: 60 },
    );
    expect(below).toMatchObject({
      ok: true,
      status: 'corrected',
      meta: { end: false, end_reason: null },
      projection: { interestAfter: 70, endReason: null },
    });
    const above = validateTurnMeta(
      output({ interest_delta: 10, end: true, end_reason: 'goal_achieved' }),
      { ...ctx, interest: 75 },
    );
    expect(above).toMatchObject({
      status: 'valid',
      meta: { end: true, end_reason: 'goal_achieved' },
      projection: { endReason: 'goal_achieved' },
    });
  });

  it('projects abandonment from the rules, not only from the model', () => {
    const result = validateTurnMeta(output({ interest_delta: -15 }), { ...ctx, interest: 20 });
    expect(result).toMatchObject({
      ok: true,
      meta: { end: true, end_reason: 'buyer_abandoned' },
      projection: { interestAfter: 5, endReason: 'buyer_abandoned' },
    });
  });

  it('metadata that cannot be interpreted → error to regenerate the turn', () => {
    expect(validateTurnMeta({ reply: 'Hola' }, ctx)).toEqual({ ok: false, reason: 'unparseable' });
    expect(validateTurnMeta(output({ interest_delta: 'mucho' }), ctx)).toEqual({
      ok: false,
      reason: 'unparseable',
    });
    expect(validateTurnMeta(output({}, ''), ctx)).toEqual({ ok: false, reason: 'unparseable' });
    expect(validateTurnMeta(output({ revealed: ['email'] }), ctx)).toEqual({
      ok: false,
      reason: 'unparseable',
    });
  });
});

describe('projectTurn', () => {
  const meta = { interest_delta: 0, seller_abusive: false, end: false, end_reason: null };

  it('keeps the floor of 11 in the first 3 seller messages unless abusive', () => {
    expect(projectTurn(20, 3, { ...meta, interest_delta: -15 }).interestAfter).toBe(11);
    expect(
      projectTurn(20, 3, { ...meta, interest_delta: -15, seller_abusive: true }),
    ).toMatchObject({ interestAfter: 5, endReason: 'buyer_abandoned' });
  });

  it('closes on the 20th seller message', () => {
    expect(projectTurn(50, 20, meta).endReason).toBe('message_limit');
  });
});
