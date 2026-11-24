import 'server-only';
import { requireSuperadmin } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/supabase/database.types';
import type { OrganizationListFilters } from './schemas';

export const ORGANIZATIONS_PAGE_SIZE = 20;

type Enums = Database['public']['Enums'];

export interface OrganizationRow {
  id: string;
  name: string;
  type: Enums['organization_type'];
  status: Enums['organization_status'];
  /** Only meaningful while suspended (the last suspension is kept after reactivating). */
  suspendedReason: string | null;
  createdAt: string;
  dailyLimit: number | null;
  monthlyLimit: number | null;
  monthSimulations: number;
}

/** /admin/organizaciones (S2, rpc admin_list_organizations). */
export async function listOrganizations(filters: OrganizationListFilters) {
  const ctx = await requireSuperadmin('/admin/organizaciones');
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('admin_list_organizations', {
    p_q: (filters.q ?? null) as unknown as string,
    p_limit: ORGANIZATIONS_PAGE_SIZE,
    p_offset: (filters.page - 1) * ORGANIZATIONS_PAGE_SIZE,
  });
  if (error) throw new Error(`admin_list_organizations failed (${error.code})`);
  const rows: OrganizationRow[] = (data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    type: r.type,
    status: r.status,
    suspendedReason: r.status === 'suspended' ? r.suspended_reason : null,
    createdAt: r.created_at,
    dailyLimit: r.daily_limit,
    monthlyLimit: r.monthly_limit,
    monthSimulations: Number(r.month_simulations ?? 0),
  }));
  const total = Number(data?.[0]?.total_count ?? 0);
  return {
    rows,
    total,
    pageCount: Math.max(1, Math.ceil(total / ORGANIZATIONS_PAGE_SIZE)),
    timezone: ctx.timezone,
  };
}
