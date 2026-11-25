import { z } from 'zod';
import { CAUTIVA_STAGES } from './domain/cautiva';

/**
 * Practice inputs (contracts/server-actions.md → configurePractice/startPractice; contracts/routes.md
 * → /practicar). data-model.md → practice_sessions.difficulty (1–5), hints_enabled, focus_stage,
 * selected_objection_ids (1–3 distinct).
 */
const uuid = z.uuid({ error: 'Selecciona una opción válida.' });

const checkbox = z.preprocess(
  (value) => value === true || value === 'on' || value === 'true',
  z.boolean(),
);

export const practiceSetupSchema = z.object({
  productId: z.uuid({ error: 'Elige un producto.' }),
  objectionIds: z
    .array(uuid)
    .min(1, { error: 'Elige al menos una objeción.' })
    .max(3, { error: 'Elige como máximo 3 objeciones.' })
    .refine((ids) => new Set(ids).size === ids.length, {
      error: 'No repitas objeciones.',
    }),
  difficulty: z.coerce
    .number({ error: 'Elige una dificultad.' })
    .int({ error: 'Elige una dificultad.' })
    .min(1, { error: 'Elige una dificultad.' })
    .max(5, { error: 'Elige una dificultad.' }),
  hintsEnabled: checkbox,
  focusStage: z.preprocess(
    (value) => (value === '' || value === undefined ? null : value),
    z.enum(CAUTIVA_STAGES, { error: 'Elige una etapa válida.' }).nullable(),
  ),
  idempotencyKey: z.uuid(),
});

export type PracticeSetupInput = z.infer<typeof practiceSetupSchema>;

/** `/practicar?producto=&foco=&aviso=`: invalid values are ignored, never an error. */
export const practicarQuerySchema = z.object({
  producto: z.uuid().optional().catch(undefined),
  foco: z.enum(CAUTIVA_STAGES).optional().catch(undefined),
  aviso: z.enum(['configuracion-cambiada']).optional().catch(undefined),
});

export type PracticarQuery = z.infer<typeof practicarQuerySchema>;

export const sessionIdSchema = z.object({ sessionId: z.uuid() });

/** "Practicar de nuevo" from a result (FR-048; contracts/server-actions.md). */
export const practiceAgainSchema = z.object({ sessionId: z.uuid(), idempotencyKey: z.uuid() });

/** POST /api/practicas/[id]/turnos body (contracts/route-handlers.md; practice_messages.content). */
export const turnRequestSchema = z.object({
  clientMessageId: z.uuid(),
  text: z
    .string()
    .trim()
    .min(1, { error: 'Escribe un mensaje.' })
    .max(1000, { error: 'Tu mensaje puede tener hasta 1.000 caracteres.' }),
});

export type TurnRequest = z.infer<typeof turnRequestSchema>;
