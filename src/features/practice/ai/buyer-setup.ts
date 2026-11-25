import 'server-only';
import { generateText, NoObjectGeneratedError, NoOutputGeneratedError, Output } from 'ai';
import { AI_TASK_CONFIG, callSettingsFor } from '@/lib/ai/config';
import { getModel, type ResolvedModel } from '@/lib/ai/provider';
import { isRetryableAiError, RetryFailure, withRetry, type RetryOptions } from '@/lib/ai/retry';
import { recordAiUsage, type AiUsageInput } from '@/lib/ai/usage';
import type { Database } from '@/lib/supabase/database.types';
import { cautivaLabel, type CautivaStage } from '../domain/cautiva';
import { difficultyFor, type DifficultyLevel } from '../domain/difficulty';
import { OBJECTION_CATEGORY_LABELS, SECTOR_LABELS } from '../domain/labels';
import { assertPromptSize, clip, dataBlock } from './prompt-input';
import { BUYER_SETUP_PROMPT } from './prompts/buyer-setup';
import { promptRef } from './prompts/registry';
import { buyerSetupOutputSchema, type BuyerSetupOutput } from './schemas';
import { validatePersona, type PersonaIssue } from './validate-persona';

/**
 * Buyer persona generation (contracts/ai-agents.md → "Ficha del comprador"; FR-011–FR-013, FR-019).
 * One `generateText` + `Output.object` call per attempt, ≤ 3 attempts for 429/5xx/timeouts and for
 * output that fails the schema or `validatePersona`. One ai_usage row per attempt, without
 * `simulation_id` (the session does not exist yet). Never logs content.
 */
type Enums = Database['public']['Enums'];

interface ObjectionInput {
  text: string;
  category: Enums['objection_category'] | null;
}

export interface BuyerSetupInput {
  organizationId: string;
  userId: string;
  sector: Enums['product_sector'];
  product: {
    name: string;
    description: string;
    priceKind: Enums['price_kind'];
    priceMin: number;
    priceMax: number;
    benefits: readonly string[];
    differentiators: readonly string[];
    verifiableFacts: readonly string[];
  };
  visibleObjection: ObjectionInput;
  /** Chosen objections that stay hidden (0–2). With none, the AI generates one. */
  hiddenObjections: readonly ObjectionInput[];
  difficulty: DifficultyLevel;
  focusStage: CautivaStage | null;
}

export type BuyerSetupFailureCode = 'provider_unavailable' | 'invalid_persona';

export type BuyerSetupResult =
  | { ok: true; output: BuyerSetupOutput; promptVersion: string; modelId: string }
  | { ok: false; failureCode: BuyerSetupFailureCode };

export interface BuyerSetupDeps {
  resolveModel?: () => ResolvedModel;
  recordUsage?: (row: AiUsageInput) => Promise<void>;
  retry?: Pick<RetryOptions, 'delaysMs' | 'random' | 'budgetMs'>;
}

/** Output that parsed but broke a domain rule: retried like an invalid response. */
export class InvalidPersonaError extends Error {
  override readonly name = 'InvalidPersonaError';
  constructor(readonly issues: PersonaIssue[]) {
    super(`invalid persona: ${issues.join(', ')}`);
  }
}

function isInvalidOutput(error: unknown): boolean {
  return (
    error instanceof InvalidPersonaError ||
    NoObjectGeneratedError.isInstance(error) ||
    NoOutputGeneratedError.isInstance(error)
  );
}

const objection = (o: ObjectionInput) => ({
  texto: clip(o.text, 300),
  categoria: o.category ? OBJECTION_CATEGORY_LABELS[o.category] : null,
});

export function buildBuyerSetupPrompt(input: BuyerSetupInput): string {
  const difficulty = difficultyFor(input.difficulty);
  const product = dataBlock('producto', {
    rubro: SECTOR_LABELS[input.sector],
    nombre: clip(input.product.name, 120),
    descripcion: clip(input.product.description, 1000),
    precio: {
      tipo: input.product.priceKind === 'fixed' ? 'fijo' : 'rango',
      minimo_soles: input.product.priceMin,
      maximo_soles: input.product.priceMax,
    },
    beneficios: input.product.benefits.map((b) => clip(b, 200)),
    diferenciadores: input.product.differentiators.map((d) => clip(d, 200)),
    datos_verificables: input.product.verifiableFacts.map((f) => clip(f, 200)),
  });
  const scenario = dataBlock('escenario', {
    objecion_visible: objection(input.visibleObjection),
    objeciones_ocultas: input.hiddenObjections.map(objection),
    generar_objecion_oculta: input.hiddenObjections.length === 0,
    dificultad: {
      nivel: difficulty.level,
      nombre: difficulty.name,
      descripcion: difficulty.description,
    },
    etapa_foco: input.focusStage ? cautivaLabel(input.focusStage) : null,
  });
  return `Genera el comprador para este caso.\n\n${product}\n\n${scenario}`;
}

export async function generateBuyerSetup(
  input: BuyerSetupInput,
  deps: BuyerSetupDeps = {},
): Promise<BuyerSetupResult> {
  const { model, modelId } = (deps.resolveModel ?? (() => getModel('buyer_setup')))();
  const record = deps.recordUsage ?? recordAiUsage;
  const system = BUYER_SETUP_PROMPT.text;
  const prompt = buildBuyerSetupPrompt(input);
  assertPromptSize([system, prompt]);

  const latencies = new Map<number, number>();
  const usageRow = (
    attempt: number,
    outcome: AiUsageInput['outcome'],
    tokens: { input?: number; output?: number } = {},
  ): AiUsageInput => ({
    task: 'buyer_setup',
    organizationId: input.organizationId,
    userId: input.userId,
    model: modelId,
    latencyMs: latencies.get(attempt) ?? 0,
    outcome,
    attempt,
    inputTokens: tokens.input,
    outputTokens: tokens.output,
  });

  try {
    const { value } = await withRetry(
      async (attempt) => {
        const startedAt = performance.now();
        try {
          const result = await generateText({
            model,
            system,
            prompt,
            output: Output.object({ schema: buyerSetupOutputSchema }),
            ...callSettingsFor('buyer_setup'),
            abortSignal: AbortSignal.timeout(AI_TASK_CONFIG.buyer_setup.timeoutMs),
          });
          const output = result.output;
          latencies.set(attempt, performance.now() - startedAt);
          const validation = validatePersona(output, {
            priceMin: input.product.priceMin,
            priceMax: input.product.priceMax,
            selectedCount: input.hiddenObjections.length + 1,
            hiddenObjectionTexts: input.hiddenObjections.map((o) => o.text),
          });
          if (!validation.ok) throw new InvalidPersonaError(validation.issues);
          await record(
            usageRow(attempt, 'success', {
              input: result.usage.inputTokens,
              output: result.usage.outputTokens,
            }),
          );
          return output;
        } catch (error) {
          if (!latencies.has(attempt)) latencies.set(attempt, performance.now() - startedAt);
          throw error;
        }
      },
      {
        ...deps.retry,
        isRetryable: (error) => isRetryableAiError(error) || isInvalidOutput(error),
        onRetry: (attempt) => {
          void record(usageRow(attempt, 'retry'));
        },
      },
    );
    return { ok: true, output: value, promptVersion: promptRef(BUYER_SETUP_PROMPT), modelId };
  } catch (error) {
    if (!(error instanceof RetryFailure)) throw error;
    await record(usageRow(error.attempts, 'failure'));
    return {
      ok: false,
      failureCode: isInvalidOutput(error.lastError) ? 'invalid_persona' : 'provider_unavailable',
    };
  }
}
