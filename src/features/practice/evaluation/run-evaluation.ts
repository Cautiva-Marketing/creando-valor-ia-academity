import 'server-only';
import * as Sentry from '@sentry/nextjs';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Database } from '@/lib/supabase/database.types';
import { runEvaluator, type EvaluatorFailureCode, type EvaluatorResult } from '../ai/evaluator';
import type { EvaluationClaim } from '../ai/evaluator-input';
import { validateEvaluation } from '../ai/validate-evaluation';

/**
 * Background evaluation of a finished practice (research.md §R8, §R9; FR-036–FR-043, SC-002):
 * claim (pending → in_progress, "reading") → "scoring" → AI → validateEvaluation → "reporting" →
 * save_practice_evaluation; otherwise fail_practice_evaluation_attempt and claim again while it goes
 * back to `pending`. Duplicate triggers are harmless (the claim takes it once). Never logs content:
 * only the session id and failure codes.
 */
type EvaluationStatus = Database['public']['Enums']['evaluation_status'];
type Phase = Database['public']['Enums']['evaluation_phase'];

export type RunEvaluationOutcome = 'skipped' | 'evaluated' | EvaluationStatus;

interface RpcError {
  code?: string;
  message: string;
}

/** The RPCs runEvaluation needs (the service-role client in production, a fake in unit tests). */
export interface EvaluationDb {
  rpc(
    fn: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: RpcError | null }>;
}

export interface RunEvaluationDeps {
  db?: EvaluationDb;
  evaluate?: (claim: EvaluationClaim) => Promise<EvaluatorResult>;
  report?: (error: unknown, context: string) => void;
}

/** Automatic attempts per round (the SQL counter caps them at 3 as well). */
const MAX_ROUNDS = 3;

function defaultReport(error: unknown, context: string): void {
  const code =
    error && typeof error === 'object' && 'code' in error ? String((error as RpcError).code) : '-';
  Sentry.captureMessage(`practice_evaluation:${context}`, {
    level: 'error',
    tags: { context: 'practice_evaluation', step: context, code },
  });
  console.error(`[practice_evaluation] step=${context} code=${code}`);
}

export async function runEvaluation(
  sessionId: string,
  deps: RunEvaluationDeps = {},
): Promise<RunEvaluationOutcome> {
  const db = deps.db ?? (createAdminClient() as unknown as EvaluationDb);
  const evaluate = deps.evaluate ?? ((claim: EvaluationClaim) => runEvaluator(claim));
  const report = deps.report ?? defaultReport;
  const setPhase = async (phase: Phase) => {
    const { error } = await db.rpc('set_practice_evaluation_phase', {
      p_session: sessionId,
      p_phase: phase,
    });
    if (error) report(error, 'phase');
  };

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const claimed = await db.rpc('claim_practice_evaluation', { p_session: sessionId });
    if (claimed.error) {
      report(claimed.error, 'claim');
      return 'skipped';
    }
    if (!claimed.data) return 'skipped';
    const claim = claimed.data as EvaluationClaim;

    await setPhase('scoring');
    let failureCode: EvaluatorFailureCode;
    try {
      const result = await evaluate(claim);
      if (result.ok) {
        const validation = validateEvaluation(result.output, claim.rubric, claim.transcript);
        if (validation.ok) {
          await setPhase('reporting');
          const saved = await db.rpc('save_practice_evaluation', {
            p_session: sessionId,
            p_payload: {
              ...validation.payload,
              rubric_id: claim.rubric.id,
              prompt_version: result.promptVersion,
              model: result.modelId,
            },
          });
          if (!saved.error) return 'evaluated';
          // 23514: the second layer rejected it (same as invalid output); anything else is a bug.
          if (saved.error.code !== '23514') report(saved.error, 'save');
        }
        failureCode = 'invalid_output';
      } else {
        failureCode = result.failureCode;
      }
    } catch (error) {
      report(error, 'evaluate');
      failureCode = 'provider_error';
    }

    const failed = await db.rpc('fail_practice_evaluation_attempt', {
      p_session: sessionId,
      p_failure_code: failureCode,
    });
    if (failed.error) {
      report(failed.error, 'fail');
      return 'skipped';
    }
    const status = (failed.data as Array<{ evaluation_status: EvaluationStatus }> | null)?.[0]
      ?.evaluation_status;
    if (status !== 'pending') return status ?? 'failed';
  }
  return 'pending';
}
