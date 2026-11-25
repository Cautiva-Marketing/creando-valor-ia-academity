import { handleStatus } from '@/features/practice/status-handler';
import { loadRequestContext } from '@/lib/auth/request-context';
import { consumeRateLimit } from '@/lib/security/rate-limit';
import { createClient } from '@/lib/supabase/server';

/**
 * Practice status for the evaluation progress screen (contracts/route-handlers.md). Logic and tests
 * in src/features/practice/status-handler.ts.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  return handleStatus(id, {
    loadContext: loadRequestContext,
    rateLimit: (userId) => consumeRateLimit('practice_status', userId),
    userClient: createClient,
  });
}
