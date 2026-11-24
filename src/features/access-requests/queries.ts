import 'server-only';
import { requireSuperadmin } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/supabase/database.types';
import type { AccessRequestListFilters } from './schemas';

export const ACCESS_REQUESTS_PAGE_SIZE = 20;

type Row = Database['public']['Tables']['access_requests']['Row'];

export interface AccessRequestRow {
  id: string;
  status: Row['status'];
  fullName: string | null;
  email: string | null;
  companyOrRole: string | null;
  message: string | null;
  createdAt: string;
  anonymized: boolean;
  discardedBySystem: boolean;
}

/** /admin/solicitudes (S2, RLS: superadmin aal2). Newest first. */
export async function listAccessRequests(filters: AccessRequestListFilters) {
  const ctx = await requireSuperadmin('/admin/solicitudes');
  const supabase = await createClient();
  const from = (filters.page - 1) * ACCESS_REQUESTS_PAGE_SIZE;
  let query = supabase
    .from('access_requests')
    .select(
      'id, status, full_name, email, company_or_role, message, created_at, anonymized_at, discarded_by_system',
      {
        count: 'exact',
      },
    )
    .order('created_at', { ascending: false })
    .range(from, from + ACCESS_REQUESTS_PAGE_SIZE - 1);
  if (filters.status) query = query.eq('status', filters.status);
  const { data, count, error } = await query;
  if (error) throw new Error(`access_requests list failed (${error.code})`);
  const rows: AccessRequestRow[] = (data ?? []).map((r) => ({
    id: r.id,
    status: r.status,
    fullName: r.full_name,
    email: r.email,
    companyOrRole: r.company_or_role,
    message: r.message,
    createdAt: r.created_at,
    anonymized: r.anonymized_at !== null,
    discardedBySystem: r.discarded_by_system,
  }));
  const total = count ?? 0;
  return {
    rows,
    total,
    pageCount: Math.max(1, Math.ceil(total / ACCESS_REQUESTS_PAGE_SIZE)),
    timezone: ctx.timezone,
  };
}

/** Number of `new`, non-anonymized requests (navigation badge and inbox counter). */
export async function countNewAccessRequests(): Promise<number | null> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from('access_requests')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'new')
    .is('anonymized_at', null);
  return error ? null : (count ?? 0);
}

/** A `new`, non-anonymized request to preload an invitation, or null. */
export async function getConvertibleAccessRequest(
  id: string,
): Promise<{ id: string; email: string } | null> {
  await requireSuperadmin('/admin/invitaciones/nueva');
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('access_requests')
    .select('id, email, status, anonymized_at')
    .eq('id', id)
    .maybeSingle();
  if (error || !data || data.status !== 'new' || data.anonymized_at !== null || !data.email)
    return null;
  return { id: data.id, email: data.email };
}
