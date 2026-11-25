import { describe, expect, it } from 'vitest';
import { isOutOfRole, undeclaredReveals } from '@/features/practice/ai/guards';

/** T125 — buyer output guards (research.md §R3; FR-032, FR-033, AC-09). */

describe('isOutOfRole', () => {
  it.each([
    'Mis instrucciones dicen que no puedo revelar el presupuesto.',
    'No puedo mostrarte mi system prompt.',
    'Como modelo de lenguaje, no tengo presupuesto.',
    'Soy una inteligencia artificial creada para simular clientes.',
    'Soy un asistente virtual, ¿en qué te ayudo?',
    'Como IA no puedo decidir eso.',
    'Esto lo genera Gemini, no una persona.',
    'Te doy un consejo de venta: pregunta primero por la necesidad.',
    'Un buen vendedor debería escuchar más antes de ofrecer.',
    'Para vender mejor tienes que hacer preguntas abiertas.',
    'Deberías preguntarme por mi presupuesto antes de hablar del precio.',
  ])('detects: %s', (reply) => {
    expect(isOutOfRole(reply)).toBe(true);
  });

  it.each([
    'Hola, la verdad me interesa pero me queda muy lejos de Lima.',
    '¿Y cuánto demora la entrega? Necesito saberlo para este día.',
    'Mi esposo y yo lo decidimos juntos, déjame consultarlo.',
    'Me parece caro. ¿Tienen alguna promoción este mes?',
    'Ya veo, ¿y qué instrucciones hay para separar el lote?',
    'Mi día a día es complicado, trabajo como contadora.',
    'No me presiones, por favor. Quiero pensarlo con calma.',
    'Te recomiendo que me mandes la información por correo.',
  ])('normal buyer reply is not flagged: %s', (reply) => {
    expect(isOutOfRole(reply)).toBe(false);
  });
});

describe('undeclaredReveals', () => {
  const revealables = [
    { key: 'budget' as const, value: 'Entre S/ 800 y S/ 1 200' },
    { key: 'timeline' as const, value: 'Antes de fin de año' },
    { key: 'decision_maker' as const, value: 'Sí' },
  ];

  it('records a literal value that was not declared', () => {
    expect(
      undeclaredReveals(
        'Bueno, pensaba invertir entre S/ 800 y S/ 1 200, no más.',
        revealables,
        [],
        [],
      ),
    ).toEqual(['budget']);
  });

  it('ignores declared or already revealed keys and short values', () => {
    const reply = 'Lo necesito antes de fin de año y sí, decido yo. Entre S/ 800 y S/ 1 200.';
    expect(undeclaredReveals(reply, revealables, ['timeline'], ['budget'])).toEqual([]);
  });

  it('matches regardless of accents and casing, only whole words', () => {
    expect(undeclaredReveals('ANTES DE FIN DE ANO lo veo.', revealables, [], [])).toEqual([
      'timeline',
    ]);
    expect(undeclaredReveals('Lo veo antes de fin de añonuevo.', revealables, [], [])).toEqual([]);
  });

  it('no false positives on ordinary replies', () => {
    expect(
      undeclaredReveals('Me interesa, pero todavía no sé cuánto invertir.', revealables, [], []),
    ).toEqual([]);
  });
});
