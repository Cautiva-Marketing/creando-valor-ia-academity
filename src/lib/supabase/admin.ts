import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { serverEnv } from '@/lib/env';
import { publicEnv } from '@/lib/env.public';
import type { Database } from './database.types';

/**
 * Administrative client with the Supabase SECRET key (research.md §R3). Bypasses RLS.
 * Only for: Auth Admin API, accept_invitation, access requests, rate limiting, audit of pre-aal2
 * events and the Send Email Hook. Never persists a session.
 */
let adminClient: ReturnType<typeof build> | undefined;

function build() {
  return createClient<Database>(
    publicEnv().NEXT_PUBLIC_SUPABASE_URL,
    serverEnv().SUPABASE_SECRET_KEY,
    {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    },
  );
}

export function createAdminClient() {
  adminClient ??= build();
  return adminClient;
}

export type AdminSupabase = ReturnType<typeof createAdminClient>;
