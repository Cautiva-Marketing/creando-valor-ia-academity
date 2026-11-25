import 'server-only';
import * as Sentry from '@sentry/nextjs';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Database } from '@/lib/supabase/database.types';
import type { AiTask } from './config';
import { estimateCostUsd } from './pricing';

/**
 * ai_usage writer (FR-019, data-model.md → "ai_usage"): one row per AI call **attempt**, with tokens,
 * latency, list cost and outcome. Never content: the row is built from an explicit whitelist.
 * `simulationId` is required for buyer/evaluator and absent for buyer_setup (the session does not
 * exist yet when the persona is generated).
 */
type Outcome = Database['public']['Enums']['ai_call_outcome'];

interface UsageBase {
  organizationId: string;
  userId: string;
  model: string;
  latencyMs: number;
  outcome: Outcome;
  attempt: number;
  inputTokens?: number;
  outputTokens?: number;
  firstChunkMs?: number | null;
}

export type AiUsageInput =
  | (UsageBase & { task: 'buyer_setup'; simulationId?: never })
  | (UsageBase & { task: Exclude<AiTask, 'buyer_setup'>; simulationId: string });

export function buildAiUsageRow(input: AiUsageInput) {
  const simulationId = 'simulationId' in input ? (input.simulationId ?? null) : null;
  if (input.task === 'buyer_setup' && simulationId) {
    throw new Error('buyer_setup usage must not carry a simulationId');
  }
  if (input.task !== 'buyer_setup' && !simulationId) {
    throw new Error(`${input.task} usage requires a simulationId`);
  }
  const success = input.outcome === 'success';
  const inputTokens = success ? Math.max(0, Math.round(input.inputTokens ?? 0)) : 0;
  const outputTokens = success ? Math.max(0, Math.round(input.outputTokens ?? 0)) : 0;
  return {
    organization_id: input.organizationId,
    user_id: input.userId,
    task: input.task,
    model: input.model,
    simulation_id: simulationId,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    latency_ms: Math.max(0, Math.round(input.latencyMs)),
    first_chunk_ms:
      success && input.firstChunkMs != null ? Math.max(0, Math.round(input.firstChunkMs)) : null,
    estimated_cost_usd: estimateCostUsd(input.model, inputTokens, outputTokens),
    outcome: input.outcome,
    attempt: input.attempt,
  };
}

/** Records one attempt. Never throws: usage accounting must not break the seller's flow. */
export async function recordAiUsage(input: AiUsageInput): Promise<void> {
  try {
    const { error } = await createAdminClient().rpc('insert_ai_usage', {
      p_row: buildAiUsageRow(input),
    });
    if (error) throw Object.assign(new Error('insert_ai_usage failed'), { code: error.code });
  } catch (error) {
    Sentry.captureException(error, { tags: { context: 'ai_usage', task: input.task } });
  }
}
