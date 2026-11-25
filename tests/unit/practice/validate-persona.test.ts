import { describe, expect, it } from 'vitest';
import type { BuyerSetupOutput } from '@/features/practice/ai/schemas';
import { buyerSetupOutputSchema } from '@/features/practice/ai/schemas';
import { isPublicFigureName } from '@/features/practice/ai/public-figures';
import { validatePersona, type PersonaContext } from '@/features/practice/ai/validate-persona';

/** T069 (contracts/ai-agents.md → validatePersona; FR-012, FR-013). */

function persona(patch: Partial<BuyerSetupOutput> = {}): BuyerSetupOutput {
  return {
    buyer: {
      name: 'Lucía Ramos',
      age: 29,
      occupation: 'Asistente administrativa',
      intro: 'Trabaja en una distribuidora y quiere crecer en el área comercial.',
      motivation: 'Quiere un ascenso este año.',
      personality: 'Práctica y algo desconfiada.',
    },
    revealables: {
      budget: { amount_min: 700, amount_max: 1300, display: 'Entre S/ 700 y S/ 1 300' },
      timeline: { display: 'Este mes' },
      decision_maker: { display: 'Ella misma' },
    },
    goal: 'Que se inscriba en la clase de prueba',
    opening_message: 'Hola, vi el curso pero no sé si tengo tiempo para estudiar.',
    ...patch,
  };
}

const fixed: PersonaContext = {
  priceMin: 1000,
  priceMax: 1000,
  selectedCount: 2,
  hiddenObjectionTexts: ['La mensualidad está cara para lo que ofrecen.'],
};
const range: PersonaContext = { ...fixed, priceMin: 800, priceMax: 1200 };

const budget = (amount_min: number, amount_max: number) =>
  persona({
    revealables: {
      ...persona().revealables,
      budget: { amount_min, amount_max, display: 'Un monto' },
    },
  });

describe('validatePersona · budget (70 %–130 % of the price)', () => {
  it('accepts the exact edges with a fixed price', () => {
    expect(validatePersona(budget(700, 1300), fixed)).toEqual({ ok: true });
    expect(validatePersona(budget(1000, 1000), fixed)).toEqual({ ok: true });
  });

  it('rejects just outside the edges with a fixed price', () => {
    expect(validatePersona(budget(699.99, 1000), fixed)).toEqual({
      ok: false,
      issues: ['budget_out_of_range'],
    });
    expect(validatePersona(budget(700, 1300.01), fixed)).toEqual({
      ok: false,
      issues: ['budget_out_of_range'],
    });
  });

  it('uses the minimum and the maximum of a price range', () => {
    expect(validatePersona(budget(560, 1560), range)).toEqual({ ok: true });
    expect(validatePersona(budget(559, 1000), range).ok).toBe(false);
    expect(validatePersona(budget(900, 1561), range).ok).toBe(false);
  });

  it('a single amount (min = max) is valid inside the range', () => {
    expect(validatePersona(budget(950, 950), range)).toEqual({ ok: true });
  });
});

describe('validatePersona · generated hidden objection ⇔ one chosen objection', () => {
  it('requires it when only one objection was chosen', () => {
    expect(validatePersona(persona(), { ...fixed, selectedCount: 1 })).toEqual({
      ok: false,
      issues: ['generated_hidden_objection'],
    });
    expect(
      validatePersona(
        persona({ generated_hidden_objection: { text: 'No sé si el certificado vale.' } }),
        { ...fixed, selectedCount: 1 },
      ),
    ).toEqual({ ok: true });
  });

  it('rejects it when two or three were chosen', () => {
    expect(
      validatePersona(
        persona({
          generated_hidden_objection: { text: 'No sé si el certificado vale.', category: 'trust' },
        }),
        fixed,
      ),
    ).toEqual({ ok: false, issues: ['generated_hidden_objection'] });
  });
});

describe('validatePersona · opening message', () => {
  it('must not mention the budget amounts or display', () => {
    expect(
      validatePersona(persona({ opening_message: 'Hola, tengo S/ 1 300 para esto.' }), fixed).ok,
    ).toBe(false);
    expect(
      validatePersona(persona({ opening_message: 'Hola, mi tope es 700 soles.' }), fixed),
    ).toEqual({ ok: false, issues: ['opening_mentions_budget'] });
    expect(
      validatePersona(
        persona({ opening_message: 'Puedo pagar entre s/ 700 y s/ 1 300, ¿qué opinas?' }),
        fixed,
      ).ok,
    ).toBe(false);
  });

  it('must not raise a hidden objection', () => {
    expect(
      validatePersona(
        persona({ opening_message: 'Hola. La mensualidad está cara para lo que ofrecen, ¿no?' }),
        fixed,
      ),
    ).toEqual({ ok: false, issues: ['opening_mentions_hidden_objection'] });
    // The generated hidden objection counts too.
    expect(
      validatePersona(
        persona({
          generated_hidden_objection: { text: 'Desconfío del certificado que entregan.' },
          opening_message: 'Hola, desconfío del certificado que entregan.',
        }),
        { ...fixed, selectedCount: 1, hiddenObjectionTexts: [] },
      ),
    ).toEqual({ ok: false, issues: ['opening_mentions_hidden_objection'] });
  });

  it('accepts other numbers (e.g. hours or years)', () => {
    expect(
      validatePersona(
        persona({ opening_message: 'Hola, solo tengo 2 horas libres al día.' }),
        fixed,
      ),
    ).toEqual({ ok: true });
  });
});

describe('validatePersona · public figures (FR-013)', () => {
  it('rejects a well-known public figure name, with or without accents', () => {
    const famous = persona({ buyer: { ...persona().buyer, name: 'Mario Vargas Llosa' } });
    expect(validatePersona(famous, fixed)).toEqual({ ok: false, issues: ['public_figure'] });
    expect(isPublicFigureName('mario vargas llosa')).toBe(true);
    expect(isPublicFigureName('Gaston Acurio')).toBe(true);
  });

  it('accepts ordinary names, even when they share a surname', () => {
    expect(isPublicFigureName('Lucía Ramos')).toBe(false);
    expect(isPublicFigureName('Carmen Vargas')).toBe(false);
  });
});

describe('buyerSetupOutputSchema', () => {
  it('accepts a valid persona and rejects bad lengths and ages', () => {
    expect(buyerSetupOutputSchema.safeParse(persona()).success).toBe(true);
    expect(
      buyerSetupOutputSchema.safeParse(persona({ buyer: { ...persona().buyer, age: 17 } })).success,
    ).toBe(false);
    expect(
      buyerSetupOutputSchema.safeParse(persona({ buyer: { ...persona().buyer, age: 30.5 } }))
        .success,
    ).toBe(false);
    expect(buyerSetupOutputSchema.safeParse(persona({ goal: 'corta' })).success).toBe(false);
    expect(buyerSetupOutputSchema.safeParse(persona({ opening_message: '' })).success).toBe(false);
  });

  it('requires amount_max ≥ amount_min', () => {
    expect(buyerSetupOutputSchema.safeParse(budget(900, 800)).success).toBe(false);
  });
});
