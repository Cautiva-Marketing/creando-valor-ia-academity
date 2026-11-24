import 'server-only';
import { requireSuperadmin } from '@/lib/auth/guards';
import { checkRateLimit, getClientIp, recordRateLimitEvent } from '@/lib/security/rate-limit';
import { hashTokenHex } from '@/lib/security/tokens';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { invitationTokenParam } from './activation-schema';
import type { InvitationListFilters, InvitationStatus } from './schemas';

export const INVITATIONS_PAGE_SIZE = 20;

export interface InvitationRow {
  id: string;
  email: string;
  status: InvitationStatus;
  expiresAt: string;
  lastSentAt: string | null;
  sendStatus: 'pending' | 'sent' | 'failed';
  createdAt: string;
}

/** Invitations list for /admin/invitaciones (guard S2 + rpc admin_list_invitations, 20 per page). */
export async function listInvitations(filters: InvitationListFilters) {
  const ctx = await requireSuperadmin('/admin/invitaciones');
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('admin_list_invitations', {
    p_status: (filters.status ?? null) as unknown as string,
    p_q: (filters.q ?? null) as unknown as string,
    p_limit: INVITATIONS_PAGE_SIZE,
    p_offset: (filters.page - 1) * INVITATIONS_PAGE_SIZE,
  });
  if (error) throw new Error(`admin_list_invitations failed (${error.code})`);
  const rows: InvitationRow[] = (data ?? []).map((r) => ({
    id: r.id,
    email: r.email,
    status: r.status as InvitationStatus,
    expiresAt: r.expires_at,
    lastSentAt: r.last_sent_at,
    sendStatus: r.send_status,
    createdAt: r.created_at,
  }));
  const total = Number(data?.[0]?.total_count ?? 0);
  return {
    rows,
    total,
    pageCount: Math.max(1, Math.ceil(total / INVITATIONS_PAGE_SIZE)),
    timezone: ctx.timezone,
  };
}

export type InvitationLinkState =
  | { status: 'invalid' }
  | { status: 'rate_limited'; retryAfterSeconds: number }
  | { status: InvitationStatus; email: string; expiresAt: string };

/**
 * Public lookup of `/invitacion/[token]` (contracts/routes.md): validates the token format before any
 * query, applies `activation_ip` (a well-formed but unknown token counts as a failure) and returns only
 * `{ email, status, expiresAt }`.
 */
export async function getInvitationForToken(token: string): Promise<InvitationLinkState> {
  if (!invitationTokenParam.safeParse(token).success) return { status: 'invalid' };
  const ip = await getClientIp();
  const limit = await checkRateLimit('activation_ip', ip);
  if (!limit.allowed) return { status: 'rate_limited', retryAfterSeconds: limit.retryAfterSeconds };

  const { data, error } = await createAdminClient()
    .from('invitations')
    .select('email, expires_at, accepted_at, revoked_at')
    .eq('token_hash', hashTokenHex(token))
    .maybeSingle();
  if (error) throw new Error(`invitation lookup failed (${error.code})`);
  if (!data) {
    await recordRateLimitEvent('activation_ip', ip);
    return { status: 'invalid' };
  }
  return { status: invitationStatusOf(data), email: data.email, expiresAt: data.expires_at };
}

export function invitationStatusOf(row: {
  accepted_at: string | null;
  revoked_at: string | null;
  expires_at: string;
}): InvitationStatus {
  if (row.accepted_at) return 'accepted';
  if (row.revoked_at) return 'revoked';
  return new Date(row.expires_at).getTime() <= Date.now() ? 'expired' : 'pending';
}
