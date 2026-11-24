import 'server-only';
import { cache } from 'react';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { safeNext } from './safe-next';
import type { RequestContext } from './context-types';

export type { RequestContext } from './context-types';

/**
 * One `rpc get_request_context` per request (React.cache). Returns null without a session.
 * Does not enforce the session policy; see `getRequestContext()`.
 */
export const loadRequestContext = cache(async (): Promise<RequestContext | null> => {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return null;
  const { data, error } = await supabase.rpc('get_request_context');
  if (error || !data) return null;
  return data as unknown as RequestContext;
});

/** Current internal path (set by proxy.ts) to come back after signing in again. */
async function currentPath(): Promise<string> {
  const h = await headers();
  return safeNext(h.get('x-pathname')) ?? '/inicio';
}

/**
 * Request context with the session policy applied (research.md §R7): if the session is out of
 * policy the user is signed out locally and sent to /iniciar-sesion?next=<current route>.
 * Returns null when there is no session at all.
 */
export const getRequestContext = cache(async (): Promise<RequestContext | null> => {
  const ctx = await loadRequestContext();
  if (!ctx) return null;
  if (!ctx.session_ok) {
    const supabase = await createClient();
    await supabase.auth.signOut({ scope: 'local' });
    const next = await currentPath();
    redirect(`/iniciar-sesion?next=${encodeURIComponent(next)}`);
  }
  return ctx;
});
