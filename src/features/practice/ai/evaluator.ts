import 'server-only';
import { generateText, NoObjectGeneratedError, NoOutputGeneratedError, Output } from 'ai';
import { AI_TASK_CONFIG, callSettingsFor } from '@/lib/ai/config';
import { failoverWait, modelForAttempt, type ResolvedModel } from '@/lib/ai/provider';
import { isRetryableAiError, RetryFailure, withRetry, type RetryOptions } from '@/lib/ai/retry';
import { recordAiUsage, type AiUsageInput } from '@/lib/ai/usage';
import { buildEvaluatorPrompt, type EvaluationClaim } from './evaluator-input';
import { EVALUATOR_PROMPT } from './prompts/evaluator';
import { promptRef } from './prompts/registry';
import { evaluationOutputSchema, type EvaluationOutput } from './schemas';

/**
 * Evaluator call (contracts/ai-agents.md → "Evaluador"; research.md §R8, §R9; FR-038–FR-040).
 * `generateText` + `Output.object`, temperature ~0.2, 50 s per attempt (AbortSignal), ≤ 3 attempts
 * with backoff for 429/5xx/timeouts inside the time left before `evaluation_due_at`. Output that does
 * not parse is returned as `invalid_output` (runEvaluation fails the attempt and claims again). One
 * ai_usage row per attempt (`task = evaluator`); never logs content.
 */
export type EvaluatorFailureCode = 'invalid_output' | 'provider_error' | 'timeout';

export type EvaluatorResult =
  | { ok: true; output: EvaluationOutput; modelId: string; promptVersion: string }
  | { ok: false; failureCode: EvaluatorFailureCode; modelId: string };

export interface EvaluatorDeps {
  /** Model of attempt n (default: the task's chain, src/lib/ai/provider.ts). */
  resolveModel?: (attempt: number) => ResolvedModel;
  recordUsage?: (row: AiUsageInput) => Promise<void>;
  retry?: Pick<RetryOptions, 'delaysMs' | 'random' | 'budgetMs'>;
  timeoutMs?: number;
  now?: () => number;
}

export const EVALUATOR_PROMPT_VERSION = promptRef(EVALUATOR_PROMPT);

/** Margin kept before the evaluation deadline so the failure can still be recorded. */
const DEADLINE_MARGIN_MS = 5_000;

function isInvalidOutput(error: unknown): boolean {
  return NoObjectGeneratedError.isInstance(error) || NoOutputGeneratedError.isInstance(error);
}

function failureCodeOf(error: unknown): EvaluatorFailureCode {
  if (isInvalidOutput(error)) return 'invalid_output';
  const inner =
    error && typeof error === 'object' && 'lastError' in error
      ? (error as { lastError: unknown }).lastError
      : error;
  if (inner instanceof Error && (inner.name === 'TimeoutError' || inner.name === 'AbortError')) {
    return 'timeout';
  }
  return 'provider_error';
}

export async function runEvaluator(
  claim: EvaluationClaim,
  deps: EvaluatorDeps = {},
): Promise<EvaluatorResult> {
  const resolve = deps.resolveModel ?? ((attempt: number) => modelForAttempt('evaluator', attempt));
  // Model used by each attempt: usage rows and the result name the model that actually ran.
  const models = new Map<number, string>();
  const modelOf = (attempt: number) => models.get(attempt) ?? resolve(attempt).modelId;
  const record = deps.recordUsage ?? recordAiUsage;
  const now = deps.now ?? Date.now;
  const timeoutMs = deps.timeoutMs ?? AI_TASK_CONFIG.evaluator.timeoutMs;
  const { system, prompt } = buildEvaluatorPrompt(claim);
  const usableUntil = new Date(claim.session.dueAt).getTime() - DEADLINE_MARGIN_MS;
  const timeLeft = usableUntil - now();
  const budgetMs = Math.max(0, Math.min(deps.retry?.budgetMs ?? Infinity, timeLeft));

  const latencies = new Map<number, number>();
  const usageRow = (
    attempt: number,
    outcome: AiUsageInput['outcome'],
    tokens: { input?: number; output?: number } = {},
  ): AiUsageInput => ({
    task: 'evaluator',
    simulationId: claim.session.id,
    organizationId: claim.session.organizationId,
    userId: claim.session.userId,
    model: modelOf(attempt),
    latencyMs: latencies.get(attempt) ?? 0,
    outcome,
    attempt,
    inputTokens: tokens.input,
    outputTokens: tokens.output,
  });

  try {
    const { value, attempts } = await withRetry(
      async (attempt) => {
        const { model, modelId } = resolve(attempt);
        models.set(attempt, modelId);
        const startedAt = performance.now();
        try {
          const result = await generateText({
            model,
            system,
            prompt,
            output: Output.object({ schema: evaluationOutputSchema }),
            ...callSettingsFor('evaluator'),
            abortSignal: AbortSignal.timeout(Math.min(timeoutMs, Math.max(1, timeLeft))),
          });
          const output = result.output;
          latencies.set(attempt, performance.now() - startedAt);
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
        delaysMs: deps.retry?.delaysMs,
        random: deps.retry?.random,
        budgetMs,
        waitMsFor: failoverWait(resolve),
        isRetryable: (error) => !isInvalidOutput(error) && isRetryableAiError(error),
        // Another attempt only while at least a second remains before the deadline.
        shouldRetry: () => usableUntil - now() > 1_000,
        onRetry: (attempt) => {
          void record(usageRow(attempt, 'retry'));
        },
      },
    );
    return {
      ok: true,
      output: value,
      modelId: modelOf(attempts),
      promptVersion: EVALUATOR_PROMPT_VERSION,
    };
  } catch (error) {
    if (!(error instanceof RetryFailure)) throw error;
    await record(usageRow(error.attempts, 'failure'));
    return {
      ok: false,
      failureCode: failureCodeOf(error.lastError),
      modelId: modelOf(error.attempts),
    };
  }
}
