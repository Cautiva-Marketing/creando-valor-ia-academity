import { describe, expect, it } from 'vitest';
import { recommendNextAction, type RecommendationInput } from '@/features/today/recommendation';

/** T181 — FR-052 order: product → objections → first practice → weakest stage. */
const P1 = '11111111-1111-4111-8111-111111111111';
const P2 = '22222222-2222-4222-8222-222222222222';

const stages = (averages: Partial<Record<string, number>>) =>
  ['conoce', 'aumenta', 'une', 'transforma', 'innova', 'vende', 'asegura'].map((stage) => ({
    stage,
    label: stage[0]!.toUpperCase() + stage.slice(1),
    average: averages[stage] ?? null,
  }));

const base: RecommendationInput = {
  activeProductIds: [P1, P2],
  productIdsWithObjections: [P1],
  hasEvaluations: true,
  recentProductIds: [P2, P1],
  stages: stages({ conoce: 80, aumenta: 55, une: 70 }),
};

describe('recommendNextAction', () => {
  it('without products → register a product', () => {
    expect(
      recommendNextAction({ ...base, activeProductIds: [], productIdsWithObjections: [] }),
    ).toMatchObject({ kind: 'register_product', href: '/productos/nuevo' });
  });

  it('no active product has objections → add objections to the first one', () => {
    expect(recommendNextAction({ ...base, productIdsWithObjections: [] })).toMatchObject({
      kind: 'add_objections',
      title: 'Agrega objeciones',
      href: `/productos/${P1}`,
    });
  });

  it('without evaluations → "Haz tu primera práctica"', () => {
    expect(recommendNextAction({ ...base, hasEvaluations: false })).toMatchObject({
      kind: 'first_practice',
      title: 'Haz tu primera práctica',
      href: '/practicar',
    });
  });

  it('weakest stage with the last used product as focus', () => {
    expect(recommendNextAction(base)).toMatchObject({
      kind: 'practice_stage',
      stage: 'aumenta',
      title: 'Practica Aumenta',
      href: `/practicar?producto=${P2}&foco=aumenta`,
    });
  });

  it('a tie goes to the first stage in C.A.U.T.I.V.A.™ order', () => {
    expect(
      recommendNextAction({ ...base, stages: stages({ vende: 40, une: 40, asegura: 90 }) }).stage,
    ).toBe('une');
  });

  it('an archived last product is skipped (the next active one is used, or none)', () => {
    const archivedFirst = { ...base, recentProductIds: ['archived', P1] };
    expect(recommendNextAction(archivedFirst).href).toBe(`/practicar?producto=${P1}&foco=aumenta`);
    expect(recommendNextAction({ ...base, recentProductIds: ['archived'] }).href).toBe(
      '/practicar?foco=aumenta',
    );
  });

  it('evaluations without any stage data → practice again without focus', () => {
    expect(recommendNextAction({ ...base, stages: stages({}) })).toMatchObject({
      kind: 'practice',
      href: `/practicar?producto=${P2}`,
    });
  });
});
