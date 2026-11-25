import { after } from 'next/server';
import { handleDispatch } from '@/features/practice/evaluation/dispatch-handler';
import { runEvaluation } from '@/features/practice/evaluation/run-evaluation';
import { dispatchEnv } from '@/lib/env';

/**
 * Internal evaluation dispatcher (pg_net → here; contracts/route-handlers.md). Logic and tests in
 * src/features/practice/evaluation/dispatch-handler.ts.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(request: Request): Promise<Response> {
  return handleDispatch(request, {
    secret: () => dispatchEnv().PRACTICE_DISPATCH_SECRET,
    runEvaluation: (id) => runEvaluation(id),
    keepAlive: (work) => after(work),
  });
}
