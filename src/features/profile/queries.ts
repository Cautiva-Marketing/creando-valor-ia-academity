import 'server-only';
import { requireOperativeUser } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/supabase/database.types';

type LegalKind = Database['public']['Enums']['legal_document_kind'];

export interface ProfileAcceptance {
  kind: LegalKind;
  version: string;
  acceptedAt: string;
}

export interface Profile {
  userId: string;
  email: string;
  fullName: string | null;
  timezone: string;
  acceptances: ProfileAcceptance[];
}

/** Profile plus legal acceptances with their document (RLS: own rows only). */
export async function getProfile(): Promise<Profile> {
  const ctx = await requireOperativeUser('/perfil');
  const supabase = await createClient();
  const [profile, acceptances] = await Promise.all([
    supabase
      .from('profiles')
      .select('email, full_name, timezone')
      .eq('user_id', ctx.user_id)
      .single(),
    supabase
      .from('legal_acceptances')
      .select('accepted_at, legal_documents(kind, version)')
      .eq('user_id', ctx.user_id)
      .order('accepted_at', { ascending: false }),
  ]);
  if (profile.error) throw new Error(`profile read failed (${profile.error.code})`);
  if (acceptances.error)
    throw new Error(`legal_acceptances read failed (${acceptances.error.code})`);

  // Latest acceptance of each kind.
  const latest = new Map<LegalKind, ProfileAcceptance>();
  for (const row of acceptances.data ?? []) {
    const doc = row.legal_documents;
    if (!doc || latest.has(doc.kind)) continue;
    latest.set(doc.kind, { kind: doc.kind, version: doc.version, acceptedAt: row.accepted_at });
  }

  return {
    userId: ctx.user_id,
    email: profile.data.email,
    fullName: profile.data.full_name,
    timezone: profile.data.timezone,
    acceptances: [...latest.values()],
  };
}
