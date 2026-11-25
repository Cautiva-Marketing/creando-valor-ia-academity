import 'server-only';
import { createHash, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

/**
 * POST /api/internal/practice/evaluations (contracts/route-handlers.md → despachador interno;
 * research.md §R8). Called only by pg_net from `private.run_practice_maintenance()`.
 *
 * Bearer compared in constant time (hashes of equal length, so the length does not leak) → 401 with
 * no body. Body `{ sessionIds: uuid[1..5] }`. Answers 202 at once and evaluates sequentially after
 * the response (to stay under the provider's per-minute limit). Replays are harmless: only ids travel
 * and the claim only takes `pending` evaluations.
 */
export interface DispatchDeps {
  secret: () => string;
  runEvaluation: (sessionId: string) => Promise<unknown>;
  /** Keeps the work alive after the response (next/server `after`). */
  keepAlive: (work: () => Promise<void>) => void;
}

const bodySchema = z.object({ sessionIds: z.array(z.uuid()).min(1).max(5) });

const digest = (value: string) => createHash('sha256').update(value, 'utf8').digest();

export function bearerMatches(header: string | null, secret: string): boolean {
  const match = /^Bearer (.+)$/.exec(header ?? '');
  if (!match || !secret) return false;
  return timingSafeEqual(digest(match[1]!), digest(secret));
}

export async function handleDispatch(request: Request, deps: DispatchDeps): Promise<Response> {
  if (!bearerMatches(request.headers.get('authorization'), deps.secret())) {
    return new Response(null, { status: 401 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ code: 'validation' }, { status: 400 });
  }
  const ids = [...new Set(parsed.data.sessionIds)];
  deps.keepAlive(async () => {
    for (const id of ids) {
      try {
        await deps.runEvaluation(id);
      } catch {
        // runEvaluation reports its own failures; the next dispatch retries pending ones.
      }
    }
  });
  return Response.json({ accepted: ids.length }, { status: 202 });
}
