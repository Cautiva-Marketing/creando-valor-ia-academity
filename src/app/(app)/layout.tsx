import { redirect } from 'next/navigation';
import { AppShell } from '@/components/app-shell/app-shell';
import type { NavBadges } from '@/components/app-shell/nav-config';
import { countNewAccessRequests } from '@/features/access-requests/queries';
import { isSuperadminAal2, operativeMemberships } from '@/lib/auth/context-types';
import { mfaRedirectFor } from '@/lib/auth/guards';
import { getRequestContext } from '@/lib/auth/request-context';

/**
 * Access control for every authenticated screen (contracts/routes.md):
 *  - no session → /iniciar-sesion (proxy already redirects optimistically)
 *  - superadmin aal1 → /mfa/verificar or /mfa/registrar
 *  - no operative membership and not superadmin aal2 → /acceso-suspendido
 * Then renders the app shell with the navigation of the role.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getRequestContext();
  if (!ctx) redirect('/iniciar-sesion');
  const mfa = mfaRedirectFor(ctx);
  if (mfa) redirect(mfa);
  const superadmin = isSuperadminAal2(ctx);
  if (!superadmin && operativeMemberships(ctx).length === 0) {
    redirect('/acceso-suspendido');
  }

  return (
    <AppShell
      role={superadmin ? 'superadmin' : 'vendedor'}
      user={{ userId: ctx.user_id, name: ctx.full_name, email: ctx.email }}
      badges={superadmin ? await superadminBadges() : undefined}
    >
      {children}
    </AppShell>
  );
}

/** New access requests counter (RLS: superadmin aal2). A failure only hides the badge. */
async function superadminBadges(): Promise<NavBadges> {
  const count = await countNewAccessRequests();
  return count === null ? {} : { newAccessRequests: count };
}
