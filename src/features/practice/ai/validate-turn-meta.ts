import { buyerTurnOutputSchema, type BuyerTurnMeta, type RevealableKey } from './schemas';

/**
 * Domain validation of a buyer turn (research.md §R4; FR-027, FR-028, FR-034). Mirror of the
 * model-dependent part of `private.apply_turn_rules` (SQL is the authority and re-applies them):
 * the server needs the same projection to decide regenerations and the forced farewell.
 */
export type PracticeEndReason = 'goal_achieved' | 'buyer_abandoned' | 'message_limit';

export interface TurnContext {
  /** Interest before this turn. */
  interest: number;
  /** Seller messages including the one being answered. */
  sellerMessageCount: number;
  /** Revealable keys of the persona and those already discovered. */
  revealableKeys: readonly RevealableKey[];
  revealedKeys: readonly RevealableKey[];
  /** Hidden objection ids of the persona (h1, h2) and those already raised. */
  hiddenIds: readonly string[];
  raisedHiddenIds: readonly string[];
}

export interface TurnProjection {
  interestAfter: number;
  interestDelta: number;
  endReason: PracticeEndReason | null;
  corrected: boolean;
}

export const MAX_SELLER_MESSAGES = 20;

/** Same rules as private.apply_turn_rules (data-model.md → "Funciones de dominio en SQL"). */
export function projectTurn(
  interest: number,
  sellerMessageCount: number,
  meta: Pick<BuyerTurnMeta, 'interest_delta' | 'seller_abusive' | 'end' | 'end_reason'>,
): TurnProjection {
  let corrected = false;
  let delta = Math.trunc(meta.interest_delta);
  if (delta > 15 || delta < -15) {
    delta = Math.max(-15, Math.min(15, delta));
    corrected = true;
  }
  let after = Math.max(0, Math.min(100, interest + delta));
  if (sellerMessageCount <= 3 && !meta.seller_abusive) after = Math.max(after, 11);
  const interestDelta = Math.max(-15, Math.min(15, after - interest));

  let endReason: PracticeEndReason | null = null;
  if (after <= 10 && (sellerMessageCount >= 4 || meta.seller_abusive)) {
    endReason = 'buyer_abandoned';
  } else if (meta.end && meta.end_reason === 'goal_achieved') {
    if (after >= 80) endReason = 'goal_achieved';
    else corrected = true;
  } else if (meta.end && meta.end_reason === 'buyer_abandoned') {
    corrected = true;
  }
  if (!endReason && sellerMessageCount >= MAX_SELLER_MESSAGES) endReason = 'message_limit';
  return { interestAfter: after, interestDelta, endReason, corrected };
}

export type TurnMetaValidation =
  | {
      ok: true;
      reply: string;
      meta: BuyerTurnMeta;
      status: 'valid' | 'corrected';
      projection: TurnProjection;
    }
  | { ok: false; reason: 'unparseable' };

export function validateTurnMeta(output: unknown, context: TurnContext): TurnMetaValidation {
  const parsed = buyerTurnOutputSchema.safeParse(output);
  if (!parsed.success) return { ok: false, reason: 'unparseable' };
  const { reply, meta } = parsed.data;
  let corrected = false;

  const revealed = [...new Set(meta.revealed)].filter((key) => {
    const keep = context.revealableKeys.includes(key) && !context.revealedKeys.includes(key);
    if (!keep) corrected = true;
    return keep;
  });
  let hidden = meta.hidden_objection_raised;
  if (hidden && (!context.hiddenIds.includes(hidden) || context.raisedHiddenIds.includes(hidden))) {
    hidden = null;
    corrected = true;
  }

  const projection = projectTurn(context.interest, context.sellerMessageCount, meta);
  const normalized: BuyerTurnMeta = {
    interest_delta: projection.interestDelta,
    revealed,
    hidden_objection_raised: hidden,
    seller_abusive: meta.seller_abusive,
    end: projection.endReason === 'goal_achieved' || projection.endReason === 'buyer_abandoned',
    end_reason:
      projection.endReason === 'goal_achieved' || projection.endReason === 'buyer_abandoned'
        ? projection.endReason
        : null,
  };
  return {
    ok: true,
    reply,
    meta: normalized,
    status: corrected || projection.corrected ? 'corrected' : 'valid',
    projection,
  };
}
