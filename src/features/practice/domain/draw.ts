import { randomInt } from 'node:crypto';

/**
 * Draw of the visible objection (research.md §R6, FR-011): done on the server with
 * `crypto.randomInt` before calling the AI, which receives which one is visible and which are hidden.
 * With one objection it is the visible one and the AI generates the hidden one.
 */
export interface ObjectionDraw<T> {
  visibleId: T;
  /** The other chosen objections, in their original order (h1, h2). */
  hiddenIds: T[];
}

export function drawObjections<T>(
  ids: readonly T[],
  random: (max: number) => number = (max) => randomInt(max),
): ObjectionDraw<T> {
  if (ids.length < 1 || ids.length > 3) {
    throw new RangeError(`between 1 and 3 objections are required, got ${ids.length}`);
  }
  const index = ids.length === 1 ? 0 : random(ids.length);
  if (!Number.isInteger(index) || index < 0 || index >= ids.length) {
    throw new RangeError(`random index ${index} out of range`);
  }
  return {
    visibleId: ids[index]!,
    hiddenIds: ids.filter((_, i) => i !== index),
  };
}
