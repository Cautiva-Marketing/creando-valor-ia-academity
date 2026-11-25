import { describe, expect, it } from 'vitest';
import { historyQueryString, parseHistoryFilters } from '@/features/history/schemas';

/** T171 — /historial query filters (contracts/routes.md; FR-049). Invalid values are ignored. */
const PRODUCT = '6f1c2a4e-8b7d-4c3a-9e2f-1a2b3c4d5e6f';

describe('parseHistoryFilters', () => {
  it('parses every filter', () => {
    expect(
      parseHistoryFilters({
        producto: PRODUCT,
        dificultad: '4',
        desde: '2026-11-01',
        hasta: '2026-11-20',
        pagina: '3',
      }),
    ).toEqual({ product: PRODUCT, difficulty: 4, from: '2026-11-01', to: '2026-11-20', page: 3 });
  });

  it('defaults: no filters, page 1', () => {
    expect(parseHistoryFilters({})).toEqual({
      product: null,
      difficulty: null,
      from: null,
      to: null,
      page: 1,
    });
  });

  it('ignores invalid values', () => {
    expect(
      parseHistoryFilters({
        producto: 'no-uuid',
        dificultad: '9',
        desde: '2026-02-30',
        hasta: 'ayer',
        pagina: '-2',
      }),
    ).toEqual({ product: null, difficulty: null, from: null, to: null, page: 1 });
    expect(parseHistoryFilters({ dificultad: '2.5', pagina: 'x' })).toMatchObject({
      difficulty: null,
      page: 1,
    });
  });

  it('takes the first value of repeated parameters', () => {
    expect(parseHistoryFilters({ dificultad: ['2', '3'] }).difficulty).toBe(2);
  });

  it('desde > hasta → the range is swapped', () => {
    expect(parseHistoryFilters({ desde: '2026-11-20', hasta: '2026-11-01' })).toMatchObject({
      from: '2026-11-01',
      to: '2026-11-20',
    });
  });
});

describe('historyQueryString', () => {
  it('serializes only active filters; page 1 is omitted', () => {
    expect(
      historyQueryString({
        product: PRODUCT,
        difficulty: 2,
        from: null,
        to: '2026-11-20',
        page: 1,
      }),
    ).toBe(`producto=${PRODUCT}&dificultad=2&hasta=2026-11-20`);
    expect(
      historyQueryString(
        { product: null, difficulty: null, from: null, to: null, page: 1 },
        { page: 2 },
      ),
    ).toBe('pagina=2');
  });
});
