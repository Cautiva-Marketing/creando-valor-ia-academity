import { operativeMemberships, type RequestContext } from './context-types';
import { safeNext } from './safe-next';

/**
 * Destination after signing in (contracts/routes.md → "Destino tras iniciar sesión"):
 *   superadmin without factor            → /mfa/registrar
 *   superadmin with factor, aal1         → /mfa/verificar (keeps next)
 *   superadmin aal2                      → next || /admin/invitaciones
 *   seller without operative membership  → /acceso-suspendido
 *   seller onboarding pending|in_progress → /onboarding
 *   seller                               → next || /inicio
 */
export function destinationFor(
  ctx: Pick<
    RequestContext,
    'is_superadmin_account' | 'has_verified_factor' | 'aal' | 'memberships' | 'onboarding_status'
  >,
  next?: string | null,
): string {
  const safe = safeNext(next);
  if (ctx.is_superadmin_account) {
    if (!ctx.has_verified_factor) return '/mfa/registrar';
    if (ctx.aal !== 'aal2') {
      return safe ? `/mfa/verificar?next=${encodeURIComponent(safe)}` : '/mfa/verificar';
    }
    return safe ?? '/admin/invitaciones';
  }
  if (operativeMemberships(ctx as RequestContext).length === 0) return '/acceso-suspendido';
  if (ctx.onboarding_status === 'pending' || ctx.onboarding_status === 'in_progress') {
    return '/onboarding';
  }
  return safe ?? '/inicio';
}
