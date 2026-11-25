import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import {
  ERROR_MESSAGES,
  parseErrorDetails,
  retryMessage,
  type ErrorCode,
  type PostgrestLikeError,
} from '@/lib/action-result';
import { authorizeSeller } from '@/lib/auth/seller';
import type { RequestContext } from '@/lib/auth/context-types';
import type { RateLimitDecision } from '@/lib/security/rate-limit';
import type { Database } from '@/lib/supabase/database.types';
import type { TurnContextPayload } from './ai/buyer-context';
import type { BuyerTurnEvent, BuyerTurnInput, BuyerTurnResult } from './ai/buyer-turn';
import { turnRequestSchema } from './schemas';
import {
  encodeEvent,
  messageAnchor,
  NDJSON_HEADERS,
  toPublicState,
  type EndReason,
  type EvaluationStatus,
  type StreamMessage,
  type TurnStreamEvent,
} from './stream/protocol';

/**
 * POST /api/practicas/[id]/turnos (contracts/route-handlers.md; FR-020–FR-034, SC-009). Separated
 * from the route file so the order of checks and the stream can be tested with fakes (T098).
 *
 * Never logs request bodies, messages or replies (FR-057).
 */
type Client = SupabaseClient<Database>;

export interface TurnHandlerDeps {
  loadContext: () => Promise<RequestContext | null>;
  /** Consumes one `practice_turn` event for the user (20/min). */
  rateLimit: (userId: string) => Promise<RateLimitDecision>;
  userClient: () => Promise<Client>;
  adminClient: () => Client;
  runTurn: (input: BuyerTurnInput) => AsyncGenerator<BuyerTurnEvent, BuyerTurnResult, void>;
  scheduleEvaluation: (sessionId: string) => void;
  /** Keeps the work alive after the response is closed (next/server `after`). */
  keepAlive: (work: Promise<unknown>) => void;
  /** Reports an unexpected error (Sentry) and returns its reference id. */
  report: (error: unknown, context: string) => string;
}

const TURN_ERROR_MESSAGE = 'El cliente no pudo responder. Reintenta tu mensaje.';
const SESSION_EXPIRED_MESSAGE = 'Tu sesión expiró. Vuelve a iniciar sesión.';

function json(status: number, body: Record<string, unknown>, headers: HeadersInit = {}): Response {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store', ...headers },
  });
}

function failure(
  status: number,
  code: ErrorCode,
  extra: Record<string, unknown> = {},
  headers?: HeadersInit,
): Response {
  return json(status, { code, message: ERROR_MESSAGES[code], ...extra }, headers);
}

const idSchema = z.uuid();

interface BeginRow {
  seller_seq: number | null;
  already_answered: boolean;
  buyer_seq: number | null;
  closed: boolean;
}

interface CommitRow {
  buyer_seq: number;
  state: Record<string, unknown>;
  ended: boolean;
  end_reason: EndReason | null;
  evaluation_status: EvaluationStatus | null;
}

async function readMessage(client: Client, sessionId: string, seq: number): Promise<StreamMessage> {
  const { data, error } = await client
    .from('practice_messages')
    .select('seq, content, created_at')
    .eq('session_id', sessionId)
    .eq('seq', seq)
    .single();
  if (error || !data) throw new Error(`message ${seq} not readable (${error?.code ?? 'no data'})`);
  return {
    seq: data.seq,
    id: messageAnchor(data.seq),
    content: data.content,
    createdAt: data.created_at,
  };
}

async function sessionStatus(client: Client, sessionId: string): Promise<string | null> {
  const { data } = await client
    .from('practice_sessions')
    .select('status')
    .eq('id', sessionId)
    .maybeSingle();
  return data?.status ?? null;
}

async function beginError(
  error: PostgrestLikeError,
  client: Client,
  sessionId: string,
  deps: TurnHandlerDeps,
): Promise<Response> {
  switch (error.code) {
    case 'P0002':
      return failure(404, 'not_found');
    case '42501':
      return failure(403, 'suspended');
    case '23514':
    case '22023':
      return failure(400, 'validation', { fieldErrors: { text: ['Escribe un mensaje.'] } });
    case 'P0010': {
      const details = parseErrorDetails(error.code, error.details) ?? {};
      if (details.reason === 'not_active') {
        details.status = (await sessionStatus(client, sessionId)) ?? 'finalized';
      }
      return failure(409, 'conflict', { details });
    }
    default: {
      const referenceId = deps.report(error, 'practice_turn.begin');
      return failure(500, 'unexpected', { referenceId });
    }
  }
}

export async function handleTurn(
  request: Request,
  rawId: string,
  deps: TurnHandlerDeps,
): Promise<Response> {
  // 1. Session (no session or out of policy → 401; the browser saves the draft and signs in again).
  const ctx = await deps.loadContext();
  if (!ctx || !ctx.session_ok) {
    return json(401, { code: 'unauthorized', message: SESSION_EXPIRED_MESSAGE });
  }

  // 2. Rate limit practice_turn (20/min per user).
  const limit = await deps.rateLimit(ctx.user_id);
  if (!limit.allowed) {
    return failure(
      429,
      'rate_limited',
      {
        message: retryMessage(limit.retryAfterSeconds),
        retryAfterSeconds: limit.retryAfterSeconds,
      },
      { 'Retry-After': String(limit.retryAfterSeconds) },
    );
  }

  // 3. Validation of [id] and body.
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  const id = idSchema.safeParse(rawId);
  const parsed = turnRequestSchema.safeParse(body);
  if (!id.success || !parsed.success) {
    const fieldErrors = parsed.success ? {} : z.flattenError(parsed.error).fieldErrors;
    return failure(400, 'validation', { fieldErrors });
  }
  const sessionId = id.data;
  const { clientMessageId, text } = parsed.data;

  // 4. Seller in an active personal organization.
  const authorized = authorizeSeller(ctx);
  if ('ok' in authorized) {
    return failure(403, authorized.code === 'suspended' ? 'suspended' : 'forbidden');
  }

  // 5. Store the seller message before the AI (user client: RLS + auth.uid()).
  const client = await deps.userClient();
  const begin = await client
    .rpc('begin_practice_turn', {
      p_session: sessionId,
      p_client_message_id: clientMessageId,
      p_text: text,
    })
    .single();
  if (begin.error) return beginError(begin.error, client, sessionId, deps);
  const row = begin.data as BeginRow;
  if (row.closed) {
    deps.scheduleEvaluation(sessionId);
    return failure(409, 'conflict', { details: { reason: 'not_active', status: 'finalized' } });
  }
  const sellerSeq = row.seller_seq!;
  const admin = deps.adminClient();
  const userId = ctx.user_id;

  // 6. Already answered (retry of the same clientMessageId): one `turn`, no AI call.
  if (row.already_answered && row.buyer_seq != null) {
    const commit = await admin
      .rpc('commit_practice_turn', {
        p_user: userId,
        p_session: sessionId,
        p_seller_seq: sellerSeq,
        p_reply: '',
        p_meta: {},
        p_meta_status: 'valid',
        p_provider_wait_ms: 0,
      })
      .single();
    if (commit.error) {
      const referenceId = deps.report(commit.error, 'practice_turn.replay');
      return failure(500, 'unexpected', { referenceId });
    }
    const replay = commit.data as unknown as CommitRow;
    const events: TurnStreamEvent[] = [
      {
        type: 'turn',
        buyerMessage: await readMessage(admin, sessionId, replay.buyer_seq),
        state: toPublicState(replay.state),
      },
    ];
    if (replay.ended && replay.end_reason) {
      events.push({
        type: 'ended',
        endReason: replay.end_reason,
        evaluationStatus: replay.evaluation_status,
      });
    }
    return new Response(events.map(encodeEvent).join(''), { status: 200, headers: NDJSON_HEADERS });
  }

  // 7. Stream the buyer turn. The work runs detached from the browser: if the seller disconnects,
  //    the generation continues and the turn is committed (FR-023).
  const sellerMessage = await readMessage(client, sessionId, sellerSeq);
  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  let open = true;
  const send = (event: TurnStreamEvent) => {
    if (!open || !controller) return;
    try {
      controller.enqueue(encoder.encode(encodeEvent(event)));
    } catch {
      open = false;
    }
  };
  const close = () => {
    if (!open || !controller) return;
    open = false;
    try {
      controller.close();
    } catch {
      // already closed by the browser
    }
  };

  const work = async () => {
    send({ type: 'ack', sellerMessage });
    let providerWaitMs = 0;
    try {
      const context = await admin.rpc('get_practice_turn_context', {
        p_user: userId,
        p_session: sessionId,
      });
      if (context.error || !context.data) throw context.error ?? new Error('no turn context');

      const generator = deps.runTurn({
        organizationId: authorized.orgId,
        userId,
        sessionId,
        sellerSeq,
        context: context.data as unknown as TurnContextPayload,
      });
      let result: BuyerTurnResult;
      for (;;) {
        const next = await generator.next();
        if (next.done) {
          result = next.value;
          break;
        }
        send(next.value);
      }
      providerWaitMs = result.providerWaitMs;

      if (!result.ok) {
        await admin.rpc('release_practice_turn', {
          p_user: userId,
          p_session: sessionId,
          p_seller_seq: sellerSeq,
          p_provider_wait_ms: providerWaitMs,
        });
        send({
          type: 'error',
          code: 'ai_unavailable',
          message: TURN_ERROR_MESSAGE,
          retryable: true,
        });
        return;
      }

      const commit = await admin
        .rpc('commit_practice_turn', {
          p_user: userId,
          p_session: sessionId,
          p_seller_seq: sellerSeq,
          p_reply: result.reply,
          p_meta: result.meta,
          p_meta_status: result.metaStatus,
          p_provider_wait_ms: providerWaitMs,
        })
        .single();
      if (commit.error) throw commit.error;
      const committed = commit.data as unknown as CommitRow;
      send({
        type: 'turn',
        buyerMessage: await readMessage(admin, sessionId, committed.buyer_seq),
        state: toPublicState(committed.state),
      });
      if (committed.ended && committed.end_reason) {
        send({
          type: 'ended',
          endReason: committed.end_reason,
          evaluationStatus: committed.evaluation_status,
        });
        if (committed.evaluation_status === 'pending') deps.scheduleEvaluation(sessionId);
      }
    } catch (error) {
      const referenceId = deps.report(error, 'practice_turn.stream');
      await admin
        .rpc('release_practice_turn', {
          p_user: userId,
          p_session: sessionId,
          p_seller_seq: sellerSeq,
          p_provider_wait_ms: providerWaitMs,
        })
        .then(
          () => undefined,
          () => undefined,
        );
      send({ type: 'reset' });
      send({
        type: 'error',
        code: 'unexpected',
        message: `${ERROR_MESSAGES.unexpected} Referencia: ${referenceId}.`,
        retryable: true,
        referenceId,
      });
    } finally {
      close();
    }
  };

  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
    cancel() {
      open = false; // the browser left; the work goes on
    },
  });
  deps.keepAlive(work());
  return new Response(stream, { status: 200, headers: NDJSON_HEADERS });
}
