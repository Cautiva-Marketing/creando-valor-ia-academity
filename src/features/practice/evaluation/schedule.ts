import 'server-only';
import { after } from 'next/server';
import { runEvaluation } from './run-evaluation';

/**
 * Immediate trigger of the evaluation of a finished practice (research.md §R8): runs after the
 * response with `after()`, up to the route's `maxDuration`. If it does not finish (or never runs),
 * the evaluation stays `pending` and the minute dispatcher (pg_net) picks it up; a duplicate trigger
 * is harmless because `claim_practice_evaluation` takes it once.
 */
export function scheduleEvaluation(sessionId: string): void {
  after(async () => {
    try {
      await runEvaluation(sessionId);
    } catch {
      // The dispatcher retries pending evaluations; nothing to report to the seller here.
    }
  });
}
