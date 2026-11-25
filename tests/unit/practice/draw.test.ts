import { describe, expect, it, vi } from 'vitest';
import { drawObjections } from '@/features/practice/domain/draw';

/** T069 (research.md §R6): the visible objection is drawn on the server before calling the AI. */

describe('drawObjections', () => {
  it('with one objection it is the visible one and none of the chosen is hidden', () => {
    const random = vi.fn(() => 0);
    expect(drawObjections(['a'], random)).toEqual({ visibleId: 'a', hiddenIds: [] });
  });

  it('with two or three, one is visible and the rest stay hidden in their order', () => {
    expect(drawObjections(['a', 'b'], () => 1)).toEqual({ visibleId: 'b', hiddenIds: ['a'] });
    expect(drawObjections(['a', 'b', 'c'], () => 0)).toEqual({
      visibleId: 'a',
      hiddenIds: ['b', 'c'],
    });
    expect(drawObjections(['a', 'b', 'c'], () => 2)).toEqual({
      visibleId: 'c',
      hiddenIds: ['a', 'b'],
    });
  });

  it('asks the random source for an index below the number of objections', () => {
    const random = vi.fn(() => 1);
    drawObjections(['a', 'b', 'c'], random);
    expect(random).toHaveBeenCalledWith(3);
  });

  it('uses crypto.randomInt by default and always returns a chosen id', () => {
    for (let i = 0; i < 30; i++) {
      const { visibleId, hiddenIds } = drawObjections(['a', 'b', 'c']);
      expect([visibleId, ...hiddenIds].sort()).toEqual(['a', 'b', 'c']);
    }
  });

  it('rejects 0 or more than 3 objections', () => {
    expect(() => drawObjections([])).toThrow(RangeError);
    expect(() => drawObjections(['a', 'b', 'c', 'd'])).toThrow(RangeError);
  });
});
