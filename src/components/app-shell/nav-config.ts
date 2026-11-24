import {
  BarChart3,
  Building2,
  Home,
  Inbox,
  Mail,
  Palette,
  UserRound,
  type LucideIcon,
} from 'lucide-react';

/** Sections by role (contracts/routes.md → "Navegación por rol"). */
export type ShellRole = 'vendedor' | 'superadmin';

export interface NavItem {
  href: string;
  label: string;
  /** Shorter label for the bottom bar. */
  shortLabel?: string;
  icon: LucideIcon;
  /** Key of a counter passed by the server (e.g. new access requests). */
  badgeKey?: 'newAccessRequests';
}

export type NavBadges = Partial<Record<NonNullable<NavItem['badgeKey']>, number>>;

export const NAV_ITEMS: Record<ShellRole, NavItem[]> = {
  vendedor: [
    { href: '/inicio', label: 'Inicio', icon: Home },
    { href: '/perfil', label: 'Perfil', icon: UserRound },
  ],
  superadmin: [
    { href: '/admin/invitaciones', label: 'Invitaciones', icon: Mail },
    {
      href: '/admin/solicitudes',
      label: 'Solicitudes',
      icon: Inbox,
      badgeKey: 'newAccessRequests',
    },
    {
      href: '/admin/organizaciones',
      label: 'Organizaciones',
      shortLabel: 'Orgs.',
      icon: Building2,
    },
    { href: '/admin/consumo', label: 'Consumo', icon: BarChart3 },
    { href: '/design', label: 'Design system', shortLabel: 'Diseño', icon: Palette },
  ],
};

export function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function badgeLabel(count: number | undefined): string | null {
  if (!count) return null;
  return count > 99 ? '99+' : String(count);
}
