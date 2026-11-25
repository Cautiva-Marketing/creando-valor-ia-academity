import type { EvaluationClaim } from '@/features/practice/ai/evaluator-input';
import type { TranscriptMessage } from '@/features/practice/ai/validate-evaluation';

/**
 * Evaluation input like `claim_practice_evaluation` returns it (fictitious data), shared by the
 * evaluator, runEvaluation and golden dataset tests. Rubric keys and weights are those of rubric v1.
 */
const anchors = { low: 'Ancla baja.', mid: 'Ancla media.', high: 'Ancla alta.' };

type Criterion = EvaluationClaim['rubric']['criteria'][number];

const BASE: Array<Pick<Criterion, 'key' | 'name' | 'weight' | 'stages'>> = [
  {
    key: 'first_impression',
    name: 'Primera impresión y confianza',
    weight: 10,
    stages: ['conoce'],
  },
  { key: 'diagnosis', name: 'Diagnóstico y preguntas', weight: 20, stages: ['conoce'] },
  { key: 'active_listening', name: 'Escucha activa y empatía', weight: 10, stages: ['une'] },
  {
    key: 'value_argument',
    name: 'Argumentación de valor',
    weight: 20,
    stages: ['aumenta', 'transforma'],
  },
  { key: 'objection_handling', name: 'Manejo de objeciones', weight: 15, stages: ['innova'] },
  { key: 'negotiation_close', name: 'Negociación y cierre', weight: 15, stages: ['vende'] },
  { key: 'follow_up', name: 'Seguimiento y siguiente paso', weight: 10, stages: ['asegura'] },
];

export const RUBRIC_V1_CRITERIA: Criterion[] = BASE.map((c) => ({
  ...c,
  description: `Descripción de ${c.name}.`,
  anchors,
}));

export const SAMPLE_TRANSCRIPT: TranscriptMessage[] = [
  { seq: 1, author: 'buyer', content: 'Hola, me interesa pero no tengo tiempo para estudiar.' },
  { seq: 2, author: 'seller', content: 'Hola Lucía, entiendo. ¿Cómo es tu semana?' },
  { seq: 3, author: 'buyer', content: 'Trabajo de lunes a sábado.' },
  {
    seq: 4,
    author: 'seller',
    content: 'Las clases quedan grabadas, puedes verlas cuando quieras.',
  },
  { seq: 5, author: 'buyer', content: 'Ya veo, lo voy a pensar.' },
];

export function evaluationClaim(overrides: Partial<EvaluationClaim> = {}): EvaluationClaim {
  return {
    session: {
      id: '00000000-0000-4000-9000-000000000e01',
      organizationId: '00000000-0000-4000-b000-00000000000c',
      userId: '00000000-0000-4000-a000-000000000013',
      difficulty: 3,
      focusStage: null,
      endReason: 'seller_ended',
      attempt: 1,
      dueAt: new Date(Date.now() + 3 * 60_000).toISOString(),
    },
    scenario: {
      buyer: {
        name: 'Lucía Ramos',
        age: 29,
        occupation: 'Asistente administrativa',
        intro: 'Trabaja en una distribuidora y quiere crecer.',
        goal: 'Que se inscriba en la clase de prueba',
        motivation: 'Quiere un ascenso este año.',
        personality: 'Práctica y algo desconfiada.',
      },
      revealables: [
        { key: 'budget', value: 'Entre S/ 800 y S/ 1 200' },
        { key: 'timeline', value: 'Este mes' },
        { key: 'decision_maker', value: 'Ella misma' },
      ],
      visibleObjection: 'No tengo tiempo para estudiar.',
      hiddenObjections: [{ id: 'h1', text: 'La mensualidad está cara.' }],
      product: {
        version: 2,
        sector: 'education',
        name: 'Curso de ventas',
        description: 'Curso en línea de 8 semanas con clases grabadas.',
        priceKind: 'fixed',
        priceMin: 1000,
        priceMax: 1000,
        benefits: ['Certificado'],
        differentiators: ['Mentoría semanal'],
        verifiableFacts: ['Más de 500 egresados'],
      },
    },
    rubric: {
      id: '00000000-0000-4000-8000-0000000000a1',
      version: '1.0',
      name: 'Ventas consultivas',
      criteria: RUBRIC_V1_CRITERIA,
    },
    transcript: SAMPLE_TRANSCRIPT,
    ...overrides,
  };
}
