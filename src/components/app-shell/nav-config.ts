import {
  BarChart3,
  Building2,
  History,
  Inbox,
  Mail,
  MessagesSquare,
  Package,
  Palette,
  Sun,
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
  /** Extra path prefixes that also mark the item as current (e.g. /practicas/[id] for Practicar). */
  match?: readonly string[];
  /** Key of a counter passed by the server (e.g. new access requests). */
  badgeKey?: 'newAccessRequests';
}

export type NavBadges = Partial<Record<NonNullable<NavItem['badgeKey']>, number>>;

export const NAV_ITEMS: Record<ShellRole, NavItem[]> = {
  // 002 (FR-053, research.md §R12): Hoy · Practicar · Historial · Mis productos; Perfil lives in the
  // account menu. `/inicio` keeps its URL (001 login and onboarding destination).
  vendedor: [
    { href: '/inicio', label: 'Hoy', icon: Sun },
    { href: '/practicar', label: 'Practicar', icon: MessagesSquare, match: ['/practicas'] },
    { href: '/historial', label: 'Historial', icon: History },
    { href: '/productos', label: 'Mis productos', shortLabel: 'Productos', icon: Package },
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

export function isItemActive(pathname: string, item: Pick<NavItem, 'href' | 'match'>): boolean {
  return [item.href, ...(item.match ?? [])].some((prefix) => isActive(pathname, prefix));
}

export function badgeLabel(count: number | undefined): string | null {
  if (!count) return null;
  return count > 99 ? '99+' : String(count);
}
