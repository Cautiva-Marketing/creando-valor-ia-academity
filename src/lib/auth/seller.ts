import 'server-only';
import { forbidden } from 'next/navigation';
import { fail, type ActionFailure } from '@/lib/action-result';
import { authorizeOperative, requireOperativeUser } from './guards';
import { personalOrganization, type ContextMembership } from './context-types';
import type { RequestContext } from './request-context';

/**
 * Seller guards (002, contracts/server-actions.md → "pertenencia `vendedor` en la organización
 * personal"). Products and practices live in the seller's personal organization; SQL repeats the
 * check (private.assert_seller_org) and is the authority.
 */
function sellerMembership(ctx: RequestContext): ContextMembership | undefined {
  const personal = personalOrganization(ctx);
  return personal?.roles.includes('vendedor') ? personal : undefined;
}

/** Whether the user is a seller in their personal organization (002 features apply). */
export function isSeller(ctx: RequestContext): boolean {
  return sellerMembership(ctx) !== undefined;
}

/** Page guard: operative seller with a personal organization; anyone else gets 403. */
export async function requireSeller(
  next = '/inicio',
): Promise<{ ctx: RequestContext; orgId: string }> {
  const ctx = await requireOperativeUser(next);
  const membership = sellerMembership(ctx);
  if (!membership) forbidden();
  return { ctx, orgId: membership.organization_id };
}

/** Action guard (after authenticateAction + Zod): returns the organization or a failure. */
export function authorizeSeller(ctx: RequestContext): { orgId: string } | ActionFailure {
  const denied = authorizeOperative(ctx);
  if (denied) return denied;
  const membership = sellerMembership(ctx);
  return membership ? { orgId: membership.organization_id } : fail('forbidden');
}
