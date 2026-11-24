import { describe, expect, it } from 'vitest';
import { usageSearchSchema } from '@/features/usage/schemas';

describe('usageSearchSchema', () => {
  it('defaults to the current month', () => {
    expect(usageSearchSchema.parse({})).toEqual({ periodo: 'current_month' });
  });
  it('accepts the known periods', () => {
    for (const periodo of ['today', 'current_month', 'previous_month']) {
      expect(usageSearchSchema.safeParse({ periodo }).success).toBe(true);
    }
    expect(
      usageSearchSchema.parse({ periodo: 'range', desde: '2026-01-01', hasta: '2026-01-31' }),
    ).toEqual({
      periodo: 'range',
      desde: '2026-01-01',
      hasta: '2026-01-31',
    });
  });
  it('rejects an unknown period', () => {
    expect(usageSearchSchema.safeParse({ periodo: 'semana' }).success).toBe(false);
  });
  it('rejects malformed or impossible dates', () => {
    for (const desde of ['2026-1-01', '01/01/2026', '2026-02-30', 'ayer']) {
      expect(
        usageSearchSchema.safeParse({ periodo: 'range', desde, hasta: '2026-03-01' }).success,
      ).toBe(false);
    }
  });
  it('rejects from > to and a missing bound', () => {
    expect(
      usageSearchSchema.safeParse({ periodo: 'range', desde: '2026-02-01', hasta: '2026-01-01' })
        .success,
    ).toBe(false);
    expect(usageSearchSchema.safeParse({ periodo: 'range', desde: '2026-02-01' }).success).toBe(
      false,
    );
  });
  it('rejects ranges longer than a year', () => {
    expect(
      usageSearchSchema.safeParse({ periodo: 'range', desde: '2024-01-01', hasta: '2026-01-01' })
        .success,
    ).toBe(false);
  });
});
