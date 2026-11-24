import { BottomNav } from './bottom-nav';
import type { NavBadges, ShellRole } from './nav-config';
import { SkipLink } from './skip-link';
import { TopBar, type ShellUser } from './top-bar';

/** Authenticated shell: skip link, top bar, content and bottom bar (< 768 px). */
export function AppShell({
  role,
  user,
  badges,
  children,
}: {
  role: ShellRole;
  user: ShellUser;
  badges?: NavBadges;
  children: React.ReactNode;
}) {
  return (
    <>
      <SkipLink />
      <TopBar role={role} user={user} badges={badges} />
      <main
        id="contenido"
        tabIndex={-1}
        className="mx-auto w-full max-w-6xl px-4 pt-6 pb-bottom-nav focus:outline-none sm:px-6 md:pb-10"
      >
        {children}
      </main>
      <BottomNav role={role} badges={badges} />
    </>
  );
}
