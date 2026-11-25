import { describe, expect, it } from 'vitest';
import { selectHint, selectIdeas, type HintState } from '@/features/practice/hints/select';

/** T097 — hints and ideas without AI (research.md §R11; FR-031). */

const BASE: HintState = {
  sellerMessageCount: 2,
  messagesLeft: 18,
  interest: 45,
  focusStage: null,
  pendingRevealables: ['budget', 'timeline', 'decision_maker'],
  hiddenObjectionPending: true,
};

describe('selectHint', () => {
  it('is deterministic for the same state', () => {
    expect(selectHint(BASE)).toEqual(selectHint({ ...BASE }));
  });

  it('rotates the situational hint by turn', () => {
    const ids = [0, 1, 2, 3].map((turn) => selectHint({ ...BASE, sellerMessageCount: turn }).id);
    expect(new Set(ids).size).toBe(4);
    expect(ids).toEqual([
      'reveal:budget',
      'reveal:timeline',
      'reveal:decision_maker',
      'situation:hidden',
    ]);
  });

  it('few messages left has priority over everything else', () => {
    expect(selectHint({ ...BASE, messagesLeft: 3, interest: 10 }).id).toBe(
      'situation:low-messages',
    );
  });

  it('a distrustful buyer gets the trust hint', () => {
    expect(selectHint({ ...BASE, interest: 20 }).id).toBe('situation:distrustful');
  });

  it('orients by the focus stage', () => {
    const hints = [0, 1, 2, 3, 4].map(
      (turn) => selectHint({ ...BASE, focusStage: 'innova', sellerMessageCount: turn }).id,
    );
    expect(hints).toContain('stage:innova');
  });

  it('with everything discovered suggests the goal', () => {
    expect(selectHint({ ...BASE, pendingRevealables: [], hiddenObjectionPending: false }).id).toBe(
      'situation:goal',
    );
  });

  it('only admits keys and flags (no hidden values)', () => {
    // @ts-expect-error — values are not part of the input
    selectHint({ ...BASE, pendingRevealables: [{ key: 'budget', value: 'S/ 1 000' }] });
    // @ts-expect-error — hidden objection texts are not part of the input
    selectHint({ ...BASE, hiddenObjectionText: 'Mi esposo decide' });
    expect(JSON.stringify(selectIdeas(BASE))).not.toMatch(/S\/|\d{3}/);
  });
});

describe('selectIdeas', () => {
  it('returns 2 or 3 distinct ideas', () => {
    for (const state of [
      BASE,
      { ...BASE, pendingRevealables: [], hiddenObjectionPending: false },
      { ...BASE, messagesLeft: 1, interest: 5, focusStage: 'vende' as const },
    ]) {
      const ideas = selectIdeas(state);
      expect(ideas.length).toBeGreaterThanOrEqual(2);
      expect(ideas.length).toBeLessThanOrEqual(3);
      expect(new Set(ideas.map((i) => i.id)).size).toBe(ideas.length);
    }
  });

  it('puts the focus stage idea first', () => {
    expect(selectIdeas({ ...BASE, focusStage: 'conoce' })[0]).toEqual({
      id: 'stage:conoce',
      text: '¿Qué te llevó a buscar algo así justo ahora?',
    });
  });

  it('changes with the state and the turn', () => {
    expect(selectIdeas(BASE)).not.toEqual(selectIdeas({ ...BASE, sellerMessageCount: 3 }));
    expect(selectIdeas({ ...BASE, messagesLeft: 2 }).map((i) => i.id)).toContain(
      'situation:low-messages',
    );
  });
});
