import { describe, expect, it } from 'vitest';
import { buildResultViewModel, type ResultSource } from '@/features/practice/result/view-model';

/** T157 — result view model (FR-046, FR-047). */

function source(overrides: Partial<ResultSource> = {}): ResultSource {
  return {
    criteria: [
      {
        key: 'diagnosis',
        name: 'Diagnóstico y preguntas',
        position: 2,
        stages: ['conoce'],
        status: 'evaluated',
        score: 15,
        maxScore: 20,
        evidenceSeqs: [2, 3, 99, 2],
        justification: 'Preguntaste por su objetivo.',
        improvement: 'Pregunta por el plazo.',
        confidence: 0.8,
      },
      {
        key: 'value_argument',
        name: 'Argumentación de valor',
        position: 4,
        stages: ['aumenta', 'transforma'],
        status: 'evaluated',
        score: 10,
        maxScore: 20,
        evidenceSeqs: [4],
        justification: 'Usaste un dato.',
        improvement: 'Cuantifica.',
        confidence: 0.5,
      },
      {
        key: 'follow_up',
        name: 'Seguimiento',
        position: 7,
        stages: ['asegura'],
        status: 'no_evaluable',
        score: null,
        maxScore: 10,
        evidenceSeqs: [],
        justification: 'No hubo seguimiento.',
        improvement: '',
        confidence: 0.3,
      },
    ],
    flags: [{ type: 'undue_pressure', explanation: 'Presionaste.', messageSeqs: [4, 1] }],
    messages: [
      { seq: 1, author: 'buyer', content: 'Hola.' },
      { seq: 2, author: 'seller', content: 'Hola, ¿qué buscas?' },
      { seq: 3, author: 'buyer', content: 'Un lote.' },
      { seq: 4, author: 'seller', content: 'Solo hoy tienes este precio.' },
    ],
    secrets: {
      motivation: 'Asegurar un patrimonio.',
      personality: 'Prudente.',
      revealables: [
        { key: 'budget', value: 'S/ 45 000' },
        { key: 'timeline', value: 'Fin de año' },
      ],
      hiddenObjections: [
        { id: 'h1', text: 'Desconfía de los papeles.' },
        { id: 'h2', text: 'Le queda lejos.' },
      ],
    },
    reveals: [
      { kind: 'revealable', key: 'budget', messageSeq: 3 },
      { kind: 'hidden_objection', key: 'h2', messageSeq: 3 },
    ],
    ...overrides,
  };
}

describe('buildResultViewModel', () => {
  it('quotes use the stored message content, only seller messages, once each', () => {
    const vm = buildResultViewModel(source());
    expect(vm.criteria[0]!.quotes).toEqual([{ seq: 2, anchor: 'm2', text: 'Hola, ¿qué buscas?' }]);
    expect(vm.flags[0]).toMatchObject({
      label: 'Presión indebida',
      quotes: [{ seq: 4, anchor: 'm4', text: 'Solo hoy tienes este precio.' }],
    });
  });

  it('never uses evaluator text as a quote', () => {
    const vm = buildResultViewModel(source());
    const quoted = vm.criteria.flatMap((c) => c.quotes.map((q) => q.text));
    expect(quoted).not.toContain('Preguntaste por su objetivo.');
  });

  it('criteria keep the rubric order; a shared criterion shows all its stages', () => {
    const vm = buildResultViewModel(source());
    expect(vm.criteria.map((c) => c.key)).toEqual(['diagnosis', 'value_argument', 'follow_up']);
    expect(vm.criteria[1]!.stages.map((s) => s.label)).toHaveLength(2);
  });

  it('confidence labels (Alta ≥ 0.75, Media ≥ 0.5, Baja)', () => {
    expect(buildResultViewModel(source()).criteria.map((c) => c.confidence)).toEqual([
      'Alta',
      'Media',
      'Baja',
    ]);
  });

  it('no_evaluable criteria have no score and no quotes; nothing evaluable → no score', () => {
    const vm = buildResultViewModel(source());
    expect(vm.criteria[2]).toMatchObject({ evaluated: false, score: null, quotes: [] });
    expect(vm.hasScore).toBe(true);
    const none = buildResultViewModel(
      source({
        criteria: source().criteria.map((c) => ({ ...c, status: 'no_evaluable', score: null })),
      }),
    );
    expect(none.hasScore).toBe(false);
  });

  it('revealed persona: discovered / not discovered data and raised / not raised objections', () => {
    const vm = buildResultViewModel(source());
    expect(vm.revealables).toEqual([
      { key: 'budget', label: 'Presupuesto', value: 'S/ 45 000', discovered: true, messageSeq: 3 },
      { key: 'timeline', label: 'Plazo', value: 'Fin de año', discovered: false, messageSeq: null },
    ]);
    expect(vm.hiddenObjections.map((o) => [o.id, o.raised])).toEqual([
      ['h1', false],
      ['h2', true],
    ]);
    expect(vm.motivation).toBe('Asegurar un patrimonio.');
  });
});
