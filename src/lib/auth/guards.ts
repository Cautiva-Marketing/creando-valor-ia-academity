import 'server-only';
import { forbidden, redirect } from 'next/navigation';
import { fail, rateLimited, type ActionFailure } from '@/lib/action-result';
import { consumeRateLimit } from '@/lib/security/rate-limit';
import { getRequestContext, type RequestContext } from './request-context';
import {
  isSuperadminAal2,
  operativeMemberships,
  type ContextMembership,
  type OrgRole,
} from './context-types';

/**
 * Server authorization guards (research.md §R3). Two families:
 *  - Page guards: redirect (no session, MFA pending, suspended) or render "sin permiso" (403).
 *  - Server Action guards: return an ActionFailure instead of throwing. `authenticateAction()`
 *    performs the first two steps of the fixed order (authentication → `user_mutation` rate limit),
 *    then the action validates with Zod and calls an `authorize*` helper (contracts/server-actions.md).
 */

// ------------------------------------------------------------------------------- page guards

/** Session required. */
export async function requireUser(next = '/inicio'): Promise<RequestContext> {
  const ctx = await getRequestContext();
  if (!ctx) redirect(`/iniciar-sesion?next=${encodeURIComponent(next)}`);
  return ctx;
}

/** Superadmin with aal1 must finish MFA before anything private. */
export function mfaRedirectFor(ctx: RequestContext): string | null {
  if (!ctx.is_superadmin_account || ctx.aal === 'aal2') return null;
  return ctx.has_verified_factor ? '/mfa/verificar' : '/mfa/registrar';
}

/** Operative membership (active org + active membership) or superadmin aal2. */
export async function requireOperativeUser(next = '/inicio'): Promise<RequestContext> {
  const ctx = await requireUser(next);
  const mfa = mfaRedirectFor(ctx);
  if (mfa) redirect(mfa);
  if (!isSuperadminAal2(ctx) && operativeMemberships(ctx).length === 0) {
    redirect('/acceso-suspendido');
  }
  return ctx;
}

/** Member of a given organization (optionally with one of the roles); otherwise 403. */
export async function requireOrgMember(
  orgId: string,
  roles?: OrgRole[],
): Promise<{ ctx: RequestContext; membership: ContextMembership }> {
  const ctx = await requireOperativeUser();
  const membership = findMembership(ctx, orgId, roles);
  if (!membership) forbidden();
  return { ctx, membership };
}

/** Superadmin with aal2; aal1 is sent to MFA; anyone else gets "sin permiso" (HTTP 403). */
export async function requireSuperadmin(next = '/admin/invitaciones'): Promise<RequestContext> {
  const ctx = await requireUser(next);
  const mfa = mfaRedirectFor(ctx);
  if (mfa) redirect(mfa);
  if (!isSuperadminAal2(ctx)) forbidden();
  return ctx;
}

function findMembership(
  ctx: RequestContext,
  orgId: string,
  roles?: OrgRole[],
): ContextMembership | undefined {
  return operativeMemberships(ctx).find(
    (m) => m.organization_id === orgId && (!roles || roles.some((r) => m.roles.includes(r))),
  );
}

// ---------------------------------------------------------------------- server action guards

export type GuardResult = { ok: true; ctx: RequestContext } | ActionFailure;

/**
 * Steps 1–2 of authenticated actions: session (with policy) and `user_mutation` rate limit indexed
 * by user_id. Used by every authenticated action except `signOut`.
 */
export async function authenticateAction(): Promise<GuardResult> {
  const ctx = await getRequestContext();
  if (!ctx) return fail('unauthorized', { message: 'Tu sesión terminó. Inicia sesión de nuevo.' });
  const decision = await consumeRateLimit('user_mutation', ctx.user_id);
  if (!decision.allowed) return rateLimited(decision.retryAfterSeconds);
  return { ok: true, ctx };
}

/** Variant of requireUser() for Server Actions (auth + user_mutation). */
export const actionRequireUser = authenticateAction;

export function authorizeOperative(ctx: RequestContext): ActionFailure | null {
  if (isSuperadminAal2(ctx)) return null;
  if (mfaRedirectFor(ctx)) return fail('forbidden');
  if (operativeMemberships(ctx).length === 0) return fail('suspended');
  return null;
}

export function authorizeOrgMember(
  ctx: RequestContext,
  orgId: string,
  roles?: OrgRole[],
): ActionFailure | null {
  if (operativeMemberships(ctx).length === 0) return fail('suspended');
  return findMembership(ctx, orgId, roles) ? null : fail('forbidden');
}

export function authorizeSuperadmin(ctx: RequestContext): ActionFailure | null {
  return isSuperadminAal2(ctx) ? null : fail('forbidden');
}

/** Convenience: authenticate + rate limit + superadmin aal2 (for actions without input). */
export async function actionRequireSuperadmin(): Promise<GuardResult> {
  const auth = await authenticateAction();
  if (!auth.ok) return auth;
  return authorizeSuperadmin(auth.ctx) ?? auth;
}

/** Convenience: authenticate + rate limit + operative user. */
export async function actionRequireOperativeUser(): Promise<GuardResult> {
  const auth = await authenticateAction();
  if (!auth.ok) return auth;
  return authorizeOperative(auth.ctx) ?? auth;
}

/** Convenience: authenticate + rate limit + member of org with roles. */
export async function actionRequireOrgMember(
  resolveOrg: (ctx: RequestContext) => string | undefined,
  roles?: OrgRole[],
): Promise<GuardResult> {
  const auth = await authenticateAction();
  if (!auth.ok) return auth;
  const orgId = resolveOrg(auth.ctx);
  if (!orgId) return fail(operativeMemberships(auth.ctx).length === 0 ? 'suspended' : 'forbidden');
  return authorizeOrgMember(auth.ctx, orgId, roles) ?? auth;
}
