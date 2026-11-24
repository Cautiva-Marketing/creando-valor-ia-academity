/** Shape of `public.get_request_context()` (contracts/database-rpc.md). Client-safe types. */
export type OrgRole = 'admin_empresa' | 'supervisor' | 'instructor' | 'vendedor';
export type OnboardingStatus = 'pending' | 'in_progress' | 'completed' | 'skipped';

export interface ContextMembership {
  organization_id: string;
  type: 'personal' | 'empresa';
  status: 'invited' | 'active' | 'suspended';
  roles: OrgRole[];
  org_status: 'active' | 'suspended';
}

export interface RequestContext {
  user_id: string;
  email: string;
  full_name: string | null;
  timezone: string;
  session_ok: boolean;
  aal: 'aal1' | 'aal2';
  is_superadmin_account: boolean;
  has_verified_factor: boolean;
  onboarding_status: OnboardingStatus;
  onboarding_step: number;
  memberships: ContextMembership[];
}

/** Memberships that grant access right now (active membership in an active organization). */
export function operativeMemberships(ctx: RequestContext): ContextMembership[] {
  return ctx.memberships.filter((m) => m.status === 'active' && m.org_status === 'active');
}

export function isSuperadminAal2(ctx: RequestContext): boolean {
  return ctx.is_superadmin_account && ctx.aal === 'aal2';
}

/** Personal organization of a seller (first operative personal membership). */
export function personalOrganization(ctx: RequestContext): ContextMembership | undefined {
  return operativeMemberships(ctx).find((m) => m.type === 'personal');
}
