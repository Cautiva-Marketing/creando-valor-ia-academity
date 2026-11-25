import type { CautivaStage } from '../domain/cautiva';
import type { RevealableKey } from '../ai/schemas';

/**
 * Fixed catalog of hints and "ideas para probar" (research.md §R11; FR-031). No AI: zero cost and no
 * way to leak hidden values, because nothing here is built from the session secrets.
 */
export interface CatalogEntry {
  id: string;
  /** Short guidance for the hint card. */
  hint: string;
  /** Editable message the chip inserts into the composer. */
  idea: string;
}

export const STAGE_ENTRIES: Record<CautivaStage, CatalogEntry> = {
  conoce: {
    id: 'stage:conoce',
    hint: 'Conoce: haz preguntas abiertas para entender su situación antes de hablar del producto.',
    idea: '¿Qué te llevó a buscar algo así justo ahora?',
  },
  aumenta: {
    id: 'stage:aumenta',
    hint: 'Aumenta: ayúdale a ver qué le cuesta no resolver su problema.',
    idea: '¿Qué pasaría si dejas esto para más adelante?',
  },
  une: {
    id: 'stage:une',
    hint: 'Une: conecta un beneficio concreto del producto con lo que te contó.',
    idea: 'Por lo que me cuentas, esto te ayudaría a…',
  },
  transforma: {
    id: 'stage:transforma',
    hint: 'Transforma: responde la objeción con empatía y datos verificables, sin presionar.',
    idea: 'Entiendo tu preocupación. ¿Qué te haría sentir más seguro?',
  },
  innova: {
    id: 'stage:innova',
    hint: 'Innova: muestra qué te diferencia de las otras opciones que podría estar comparando.',
    idea: '¿Con qué otras opciones lo estás comparando?',
  },
  vende: {
    id: 'stage:vende',
    hint: 'Vende: propón un siguiente paso concreto y fácil de aceptar.',
    idea: '¿Te parece si damos el siguiente paso?',
  },
  asegura: {
    id: 'stage:asegura',
    hint: 'Asegura: confirma lo acordado y resuelve las últimas dudas antes de cerrar.',
    idea: 'Para confirmar, ¿qué te falta para decidir?',
  },
};

export const REVEALABLE_ENTRIES: Record<RevealableKey, CatalogEntry> = {
  budget: {
    id: 'reveal:budget',
    hint: 'Aún no sabes cuánto piensa invertir. Pregunta por su presupuesto sin presionar.',
    idea: '¿Cuánto tenías pensado invertir en esto?',
  },
  timeline: {
    id: 'reveal:timeline',
    hint: 'Todavía no sabes para cuándo lo necesita. Pregúntale por sus plazos.',
    idea: '¿Para cuándo te gustaría tenerlo resuelto?',
  },
  decision_maker: {
    id: 'reveal:decision_maker',
    hint: 'Averigua si decide solo o con alguien más.',
    idea: '¿Alguien más participa en esta decisión?',
  },
};

export const SITUATION_ENTRIES = {
  hidden: {
    id: 'situation:hidden',
    hint: 'Puede haber una preocupación que aún no te dijo. Indaga con preguntas abiertas.',
    idea: '¿Hay algo más que te genere dudas?',
  },
  distrustful: {
    id: 'situation:distrustful',
    hint: 'El cliente desconfía: escucha, valida su preocupación y evita presionar.',
    idea: 'Te entiendo. Cuéntame qué es lo que más te preocupa.',
  },
  lowMessages: {
    id: 'situation:low-messages',
    hint: 'Te quedan pocos mensajes: propón la meta de la práctica de forma clara.',
    idea: '¿Te parece si avanzamos con el siguiente paso?',
  },
  goal: {
    id: 'situation:goal',
    hint: 'Cuando notes más interés, propón la meta de la práctica.',
    idea: '¿Te gustaría que avancemos con el siguiente paso?',
  },
} as const satisfies Record<string, CatalogEntry>;
