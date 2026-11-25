import * as Sentry from '@sentry/nextjs';
import { after } from 'next/server';
import { newReferenceId } from '@/lib/action-result';
import { runBuyerTurn } from '@/features/practice/ai/buyer-turn';
import { scheduleEvaluation } from '@/features/practice/evaluation/schedule';
import { handleTurn } from '@/features/practice/turn-handler';
import { loadRequestContext } from '@/lib/auth/request-context';
import { consumeRateLimit } from '@/lib/security/rate-limit';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

/**
 * Seller turn with the buyer reply streamed as NDJSON (contracts/route-handlers.md). The logic lives
 * in src/features/practice/turn-handler.ts; this file wires the real dependencies.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  return handleTurn(request, id, {
    loadContext: loadRequestContext,
    rateLimit: (userId) => consumeRateLimit('practice_turn', userId),
    userClient: createClient,
    adminClient: createAdminClient,
    runTurn: (input) => runBuyerTurn(input),
    scheduleEvaluation,
    keepAlive: (work) => after(() => work),
    report: (error, context) => {
      const referenceId = newReferenceId();
      Sentry.captureException(error, { tags: { referenceId, context } });
      console.error(`[unexpected] ref=${referenceId} ctx=${context}`);
      return referenceId;
    },
  });
}
