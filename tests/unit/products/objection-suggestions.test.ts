import { describe, expect, it } from 'vitest';
import {
  OBJECTION_CATEGORIES,
  OBJECTION_SUGGESTIONS,
  suggestionsFor,
} from '@/features/products/objection-suggestions';
import { PRODUCT_SECTORS } from '@/features/products/schemas';

describe('objection suggestions (FR-007, fixed catalog without AI)', () => {
  it.each(PRODUCT_SECTORS)('sector %s has suggestions in the 6 categories', (sector) => {
    const groups = suggestionsFor(sector);
    expect(groups.map((g) => g.category)).toEqual([...OBJECTION_CATEGORIES]);
    for (const group of groups) expect(group.items.length).toBeGreaterThanOrEqual(1);
  });

  it('every text has 5–300 characters and is unique within its sector', () => {
    for (const sector of PRODUCT_SECTORS) {
      const texts = suggestionsFor(sector).flatMap((g) => g.items);
      expect(new Set(texts).size).toBe(texts.length);
      for (const text of texts) {
        expect(text.trim()).toBe(text);
        expect(text.length).toBeGreaterThanOrEqual(5);
        expect(text.length).toBeLessThanOrEqual(300);
      }
    }
  });

  it('contains no personal data (emails, phone numbers, document numbers)', () => {
    const all = Object.values(OBJECTION_SUGGESTIONS).flatMap((byCategory) =>
      Object.values(byCategory).flat(),
    );
    for (const text of all) {
      expect(text).not.toMatch(/@|\d{6,}|\b9\d{2}[\s-]?\d{3}[\s-]?\d{3}\b|DNI|RUC/i);
    }
  });
});
