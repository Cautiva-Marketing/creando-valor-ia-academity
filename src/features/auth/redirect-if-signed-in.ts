import 'server-only';
import { redirect } from 'next/navigation';
import { destinationFor } from '@/lib/auth/destination';
import { loadRequestContext } from '@/lib/auth/request-context';

/**
 * "A" routes (contracts/routes.md): with a VALID session go to the destination. A session out of
 * policy is ignored here (no redirect loop); the page simply shows the form.
 */
export async function redirectIfSignedIn(next?: string | null): Promise<void> {
  const ctx = await loadRequestContext();
  if (ctx?.session_ok) redirect(destinationFor(ctx, next));
}
