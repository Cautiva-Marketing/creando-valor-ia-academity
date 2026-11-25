import type { RevealableKey } from '../ai/schemas';
import type { CautivaStage } from '../domain/cautiva';
import type { PublicState } from '../stream/protocol';
import type { HintState } from './select';

/**
 * Builds the hint input from public data only (labels, counters and reveal keys). The number of
 * hidden objections follows from the draw (FR-011): one selected objection → one generated hidden
 * objection; otherwise every non-visible selected objection is hidden.
 */
export function expectedHiddenObjections(selectedCount: number): number {
  return Math.max(1, selectedCount - 1);
}

export function hintStateFrom(input: {
  state: Pick<PublicState, 'interest' | 'sellerMessageCount' | 'messagesLeft' | 'reveals'>;
  focusStage: CautivaStage | null;
  revealableLabels: readonly RevealableKey[];
  selectedObjectionCount: number;
}): HintState {
  const revealed = new Set(
    input.state.reveals.filter((r) => r.kind === 'revealable').map((r) => r.key),
  );
  const raisedHidden = input.state.reveals.filter((r) => r.kind === 'hidden_objection').length;
  return {
    sellerMessageCount: input.state.sellerMessageCount,
    messagesLeft: input.state.messagesLeft,
    interest: input.state.interest,
    focusStage: input.focusStage,
    pendingRevealables: input.revealableLabels.filter((key) => !revealed.has(key)),
    hiddenObjectionPending: raisedHidden < expectedHiddenObjections(input.selectedObjectionCount),
  };
}
