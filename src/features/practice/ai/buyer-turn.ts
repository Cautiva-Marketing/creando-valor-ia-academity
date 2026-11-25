import 'server-only';
import { Output, parsePartialJson, streamText } from 'ai';
import { AI_TASK_CONFIG, callSettingsFor } from '@/lib/ai/config';
import { getModel, type ResolvedModel } from '@/lib/ai/provider';
import { isRetryableAiError } from '@/lib/ai/retry';
import { recordAiUsage, type AiUsageInput } from '@/lib/ai/usage';
import { buildBuyerPrompt, turnContextFor, type TurnContextPayload } from './buyer-context';
import { saysGoodbye, withFarewell } from './farewells';
import { isOutOfRole, undeclaredReveals } from './guards';
import { reportBuyerIncident, type BuyerIncident, type IncidentRef } from './incidents';
import { buyerTurnOutputSchema, type BuyerTurnMeta } from './schemas';
import { validateTurnMeta } from './validate-turn-meta';

/**
 * One buyer turn (research.md §R4/§R5; FR-023, FR-024, FR-034, FR-058). An async generator of events
 * for the NDJSON stream plus a final result:
 *
 * - `delta`: only new characters of `reply` (the JSON of the metadata never reaches the browser).
 * - `retrying`: provider 429/5xx/timeout BEFORE the first delta (≤ 3 attempts, ≤ 30 s); the wait is
 *   reported so it is added to `provider_wait_ms` (FR-028d).
 * - `reset`: discard the provisional text (invalid metadata, out-of-role guard, forced farewell
 *   regeneration, or a provider error after text was shown).
 *
 * Invalid metadata is regenerated up to 2 times; then the last text is kept with change 0
 * (`fallback`). A provider error after the first delta ends the turn without a reply. The caller must
 * not pass the browser's abort signal: the generation continues if the seller disconnects.
 */
export type BuyerTurnEvent =
  | { type: 'retrying'; attempt: number; waitMs: number }
  | { type: 'delta'; text: string }
  | { type: 'reset' };

export type BuyerTurnResult =
  | {
      ok: true;
      reply: string;
      meta: BuyerTurnMeta;
      metaStatus: 'valid' | 'corrected' | 'fallback';
      providerWaitMs: number;
    }
  | { ok: false; providerWaitMs: number };

export interface BuyerTurnInput {
  organizationId: string;
  userId: string;
  sessionId: string;
  /** Seller message being answered (incident references only). */
  sellerSeq?: number;
  context: TurnContextPayload;
}

export interface BuyerTurnDeps {
  resolveModel?: () => ResolvedModel;
  recordUsage?: (row: AiUsageInput) => Promise<void>;
  /** Waits before provider retries (default 1 s and 3 s + jitter). */
  delaysMs?: readonly number[];
  random?: () => number;
  sleep?: (ms: number) => Promise<void>;
  /** Out-of-role guard (research.md §R3): true → regenerate like invalid metadata. */
  isOutOfRole?: (reply: string) => boolean;
  reportIncident?: (kind: BuyerIncident, ref: IncidentRef) => void;
}

const MAX_PROVIDER_ATTEMPTS = 3;
const PROVIDER_BUDGET_MS = 30_000;
const MAX_REGENERATIONS = 2;
const FAREWELL_NOTE =
  'Tu interés llegó al mínimo: despídete en personaje y abandona la conversación (meta.end true, meta.end_reason "buyer_abandoned").';

class ProviderStreamError extends Error {
  override readonly name = 'ProviderStreamError';
  constructor(
    readonly inner: unknown,
    readonly emitted: boolean,
  ) {
    super('provider stream failed', { cause: inner });
  }
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function* runBuyerTurn(
  input: BuyerTurnInput,
  deps: BuyerTurnDeps = {},
): AsyncGenerator<BuyerTurnEvent, BuyerTurnResult, void> {
  const { model, modelId } = (deps.resolveModel ?? (() => getModel('buyer')))();
  const record = deps.recordUsage ?? recordAiUsage;
  const delays = deps.delaysMs ?? [1000, 3000];
  const random = deps.random ?? Math.random;
  const sleep = deps.sleep ?? defaultSleep;
  const turnContext = turnContextFor(input.context);
  const turnNumber = input.context.session.sellerMessageCount;
  const outOfRoleGuard = deps.isOutOfRole ?? isOutOfRole;
  const report = deps.reportIncident ?? reportBuyerIncident;
  const incidentRef: IncidentRef = { sessionId: input.sessionId, sellerSeq: input.sellerSeq };

  let providerWaitMs = 0;
  let attempt = 0;
  let lastText = '';
  let serverNote: string | undefined;
  let farewellRetried = false;

  const usage = (
    outcome: AiUsageInput['outcome'],
    latencyMs: number,
    extra: { inputTokens?: number; outputTokens?: number; firstChunkMs?: number | null } = {},
  ): AiUsageInput => ({
    task: 'buyer',
    simulationId: input.sessionId,
    organizationId: input.organizationId,
    userId: input.userId,
    model: modelId,
    latencyMs,
    outcome,
    attempt,
    ...extra,
  });

  for (let generation = 0; generation <= MAX_REGENERATIONS + 1; generation++) {
    const prompt = buildBuyerPrompt(input.context, serverNote);
    const startedBudget = Date.now();

    // Provider attempts of this generation: retried only before the first delta.
    let raw = '';
    let emitted = '';
    let tokens: { inputTokens?: number; outputTokens?: number } = {};
    let firstChunkMs: number | null = null;
    let latencyMs = 0;
    for (let providerAttempt = 1; ; providerAttempt++) {
      attempt++;
      const startedAt = performance.now();
      raw = '';
      emitted = '';
      firstChunkMs = null;
      try {
        const result = streamText({
          model,
          system: prompt.system,
          messages: prompt.messages,
          output: Output.object({ schema: buyerTurnOutputSchema }),
          ...callSettingsFor('buyer'),
          abortSignal: AbortSignal.timeout(AI_TASK_CONFIG.buyer.timeoutMs),
          onError: () => {
            // Errors are handled from the `error` parts below; never log content.
          },
        });
        for await (const part of result.fullStream) {
          if (part.type === 'error') throw new ProviderStreamError(part.error, emitted.length > 0);
          if (part.type !== 'text-delta') continue;
          raw += part.text;
          const { value } = await parsePartialJson(raw);
          const reply =
            value && typeof value === 'object' && !Array.isArray(value)
              ? (value as { reply?: unknown }).reply
              : undefined;
          if (
            typeof reply === 'string' &&
            reply.length > emitted.length &&
            reply.startsWith(emitted)
          ) {
            const delta = reply.slice(emitted.length);
            emitted = reply;
            firstChunkMs ??= performance.now() - startedAt;
            yield { type: 'delta', text: delta };
          }
        }
        latencyMs = performance.now() - startedAt;
        try {
          const u = await result.usage;
          tokens = { inputTokens: u.inputTokens, outputTokens: u.outputTokens };
        } catch {
          tokens = {};
        }
        break;
      } catch (error) {
        latencyMs = performance.now() - startedAt;
        const inner = error instanceof ProviderStreamError ? error.inner : error;
        const wasEmitting = emitted.length > 0;
        const retryable = isRetryableAiError(inner);
        const base = delays[Math.min(providerAttempt - 1, delays.length - 1)] ?? 0;
        const waitMs = Math.round(base * (1 + random() * 0.25));
        const withinBudget = Date.now() - startedBudget + waitMs <= PROVIDER_BUDGET_MS;
        if (!wasEmitting && retryable && providerAttempt < MAX_PROVIDER_ATTEMPTS && withinBudget) {
          await record(usage('retry', latencyMs));
          yield { type: 'retrying', attempt: providerAttempt + 1, waitMs };
          await sleep(waitMs);
          providerWaitMs += waitMs;
          continue;
        }
        await record(usage('failure', latencyMs));
        if (wasEmitting) yield { type: 'reset' };
        return { ok: false, providerWaitMs };
      }
    }

    // Validate the complete object (schema + domain) and the out-of-role guard.
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = undefined;
    }
    const validation = validateTurnMeta(parsed, turnContext);
    const outOfRole = validation.ok && outOfRoleGuard(validation.reply);
    if (outOfRole) report('out_of_role', incidentRef);
    // Text that broke the role is never kept as the fallback reply.
    if (emitted.trim() && !outOfRole) lastText = emitted;

    if (!validation.ok || outOfRole) {
      if (generation < MAX_REGENERATIONS) {
        await record(usage('retry', latencyMs, { ...tokens, firstChunkMs }));
        if (emitted) yield { type: 'reset' };
        continue;
      }
      // Regenerations exhausted: keep the last text with change 0 (FR-034).
      if (!lastText.trim() || outOfRole) {
        await record(usage('failure', latencyMs, { ...tokens, firstChunkMs }));
        if (emitted) yield { type: 'reset' };
        return { ok: false, providerWaitMs };
      }
      await record(usage('success', latencyMs, { ...tokens, firstChunkMs }));
      report('meta_fallback', incidentRef);
      return {
        ok: true,
        reply: lastText.trim().slice(0, 600),
        meta: {
          interest_delta: 0,
          revealed: [],
          hidden_objection_raised: null,
          seller_abusive: false,
          end: false,
          end_reason: null,
        },
        metaStatus: 'fallback',
        providerWaitMs,
      };
    }

    // Reveal coherence: a literal value the metadata did not declare is recorded as revealed.
    const undeclared = undeclaredReveals(
      validation.reply,
      input.context.revealables,
      validation.meta.revealed,
      turnContext.revealedKeys,
    );
    const meta: BuyerTurnMeta =
      undeclared.length > 0
        ? { ...validation.meta, revealed: [...validation.meta.revealed, ...undeclared] }
        : validation.meta;
    const metaStatus = undeclared.length > 0 ? 'corrected' : validation.status;
    if (undeclared.length > 0) report('undeclared_reveal', incidentRef);

    // Abandonment without a goodbye: one regeneration with a server note, then the catalog.
    const ending = validation.projection.endReason;
    if (ending === 'buyer_abandoned' && !saysGoodbye(validation.reply)) {
      if (!farewellRetried && generation <= MAX_REGENERATIONS) {
        farewellRetried = true;
        serverNote = FAREWELL_NOTE;
        await record(usage('retry', latencyMs, { ...tokens, firstChunkMs }));
        yield { type: 'reset' };
        continue;
      }
      await record(usage('success', latencyMs, { ...tokens, firstChunkMs }));
      return {
        ok: true,
        reply: withFarewell(validation.reply, 'abandon', turnNumber),
        meta,
        metaStatus: 'corrected',
        providerWaitMs,
      };
    }

    await record(usage('success', latencyMs, { ...tokens, firstChunkMs }));
    const reply =
      ending === 'message_limit' && !saysGoodbye(validation.reply)
        ? withFarewell(validation.reply, 'last_turn', turnNumber)
        : validation.reply;
    return {
      ok: true,
      reply,
      meta,
      metaStatus,
      providerWaitMs,
    };
  }
  return { ok: false, providerWaitMs };
}
