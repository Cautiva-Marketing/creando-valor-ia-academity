import { z } from 'zod';
import type { Database } from '@/lib/supabase/database.types';
import { CAUTIVA_STAGES } from '../domain/cautiva';

/**
 * Output schemas of the practice agents (contracts/ai-agents.md). Lengths mirror data-model.md and
 * the SQL checks of create_configured_practice, so a persona that passes here also passes there.
 */
type ObjectionCategory = Database['public']['Enums']['objection_category'];

const OBJECTION_CATEGORIES = [
  'price',
  'trust',
  'time',
  'competition',
  'logistics',
  'decision_maker',
] as const satisfies readonly ObjectionCategory[];

const text = (min: number, max: number) => z.string().trim().min(min).max(max);

const display = z.object({ display: text(1, 160) });

/** Ficha del comprador (buyer-setup@1.0.0). */
export const buyerSetupOutputSchema = z.object({
  buyer: z.object({
    name: text(2, 60),
    age: z.number().int().min(18).max(80),
    occupation: text(2, 80),
    intro: text(20, 280),
    motivation: text(10, 300),
    personality: text(10, 300),
  }),
  revealables: z.object({
    budget: z
      .object({
        amount_min: z.number().nonnegative(),
        amount_max: z.number().nonnegative(),
        display: text(1, 160),
      })
      .refine((b) => b.amount_max >= b.amount_min, {
        message: 'amount_max must be ≥ amount_min',
        path: ['amount_max'],
      }),
    timeline: display,
    decision_maker: display,
  }),
  goal: text(10, 160),
  generated_hidden_objection: z
    .object({ text: text(5, 300), category: z.enum(OBJECTION_CATEGORIES).optional() })
    .optional(),
  opening_message: text(1, 600),
});

export type BuyerSetupOutput = z.infer<typeof buyerSetupOutputSchema>;

/** Turn of the simulated buyer (buyer@1.0.0): `reply` first so it can be streamed (research.md §R4). */
export const REVEALABLE_KEYS = ['budget', 'timeline', 'decision_maker'] as const;
export type RevealableKey = (typeof REVEALABLE_KEYS)[number];

export const buyerTurnOutputSchema = z.object({
  reply: text(1, 600),
  meta: z.object({
    interest_delta: z.number().int(),
    revealed: z.array(z.enum(REVEALABLE_KEYS)),
    hidden_objection_raised: z.enum(['h1', 'h2']).nullable(),
    seller_abusive: z.boolean(),
    end: z.boolean(),
    end_reason: z.enum(['goal_achieved', 'buyer_abandoned']).nullable(),
  }),
});

export type BuyerTurnOutput = z.infer<typeof buyerTurnOutputSchema>;
export type BuyerTurnMeta = BuyerTurnOutput['meta'];

/**
 * Evaluation (evaluator@1.1.0; contracts/ai-agents.md → "Evaluador"; lengths of data-model.md).
 * Evidence comes as message ids "mN"; cross rules (rubric, seller ids, ranges) live in
 * validateEvaluation and save_practice_evaluation. `total_score` is ignored (FR-041).
 */
export const ETHICAL_FLAG_TYPES = ['unfounded_promise', 'undue_pressure'] as const;

export const evaluationOutputSchema = z.object({
  rubric_version: z.string().trim().min(1).max(20),
  criteria: z
    .array(
      z.object({
        criterion_id: z.string().trim().min(1).max(60),
        status: z.enum(['evaluated', 'no_evaluable']),
        score: z.number().int().nullable(),
        max_score: z.number().int(),
        evidence_message_ids: z.array(z.string().trim()).max(20),
        justification: text(1, 600),
        improvement: z.string().trim().max(400),
        confidence: z.number().min(0).max(1),
      }),
    )
    .min(1)
    .max(20),
  total_score: z.number().int().nullable(),
  strengths: z.array(text(1, 200)).max(5),
  improvements: z.array(text(1, 200)).max(5),
  suggested_drill: z.object({ text: text(1, 300), stage: z.enum(CAUTIVA_STAGES) }),
  ethical_flags: z
    .array(
      z.object({
        type: z.enum(ETHICAL_FLAG_TYPES),
        explanation: text(1, 400),
        message_ids: z.array(z.string().trim()).min(1).max(20),
      }),
    )
    .max(10),
});

export type EvaluationOutput = z.infer<typeof evaluationOutputSchema>;
