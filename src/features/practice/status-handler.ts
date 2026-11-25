import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { ERROR_MESSAGES, retryMessage } from '@/lib/action-result';
import type { RequestContext } from '@/lib/auth/context-types';
import type { RateLimitDecision } from '@/lib/security/rate-limit';
import type { Database } from '@/lib/supabase/database.types';

/**
 * GET /api/practicas/[id]/estado — evaluation polling (contracts/route-handlers.md): session (401) →
 * rate limit `practice_status` (60/min, 429 + Retry-After) → Zod id (400) → read with the user's
 * client under RLS (404 when not theirs). `Cache-Control: no-store`.
 */
type Client = SupabaseClient<Database>;
type Enums = Database['public']['Enums'];

export interface PracticeStatus {
  status: Enums['practice_status'];
  evaluationStatus: Enums['evaluation_status'] | null;
  evaluationPhase: Enums['evaluation_phase'] | null;
  manualRetriesLeft: number;
  endReason: Enums['practice_end_reason'] | null;
}

export interface StatusHandlerDeps {
  loadContext: () => Promise<RequestContext | null>;
  rateLimit: (userId: string) => Promise<RateLimitDecision>;
  userClient: () => Promise<Client>;
}

const MAX_MANUAL_RETRIES = 3;

function json(status: number, body: unknown, headers: HeadersInit = {}): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
}

export async function handleStatus(rawId: string, deps: StatusHandlerDeps): Promise<Response> {
  const ctx = await deps.loadContext();
  if (!ctx || !ctx.session_ok) {
    return json(401, { code: 'unauthorized', message: ERROR_MESSAGES.unauthorized });
  }
  const limit = await deps.rateLimit(ctx.user_id);
  if (!limit.allowed) {
    return json(
      429,
      {
        code: 'rate_limited',
        message: retryMessage(limit.retryAfterSeconds),
        retryAfterSeconds: limit.retryAfterSeconds,
      },
      { 'Retry-After': String(limit.retryAfterSeconds) },
    );
  }
  const id = z.uuid().safeParse(rawId);
  if (!id.success) {
    return json(400, { code: 'validation', message: ERROR_MESSAGES.validation });
  }
  const client = await deps.userClient();
  const { data, error } = await client
    .from('practice_sessions')
    .select('status, evaluation_status, evaluation_phase, evaluation_manual_retries, end_reason')
    .eq('id', id.data)
    .eq('user_id', ctx.user_id)
    .maybeSingle();
  if (error || !data) {
    return json(404, { code: 'not_found', message: ERROR_MESSAGES.not_found });
  }
  const body: PracticeStatus = {
    status: data.status,
    evaluationStatus: data.evaluation_status,
    evaluationPhase: data.evaluation_phase,
    manualRetriesLeft: Math.max(0, MAX_MANUAL_RETRIES - data.evaluation_manual_retries),
    endReason: data.end_reason,
  };
  return json(200, body);
}
