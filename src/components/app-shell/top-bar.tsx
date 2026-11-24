import Link from 'next/link';
import { Logo } from '@/components/brand/logo';
import { AccountMenu } from './account-menu';
import { DesktopNav } from './desktop-nav';
import type { NavBadges, ShellRole } from './nav-config';

export interface ShellUser {
  userId: string;
  name: string | null;
  email: string;
}

/** Top bar: brand, desktop navigation and account menu. */
export function TopBar({
  role,
  user,
  badges,
}: {
  role: ShellRole;
  user: ShellUser;
  badges?: NavBadges;
}) {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-surface-raised">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-2 sm:px-6">
        <div className="flex items-center gap-6">
          <Link
            href={role === 'superadmin' ? '/admin' : '/inicio'}
            className="inline-flex min-h-touch min-w-touch items-center rounded-md"
            aria-label="Creando Valor IA™, ir al inicio"
          >
            <Logo compact className="lg:hidden" />
            <Logo className="hidden lg:inline-flex" />
          </Link>
          <DesktopNav role={role} badges={badges} />
        </div>
        <AccountMenu userId={user.userId} name={user.name} email={user.email} role={role} />
      </div>
    </header>
  );
}
