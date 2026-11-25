'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { NAV_ITEMS, badgeLabel, isItemActive, type NavBadges, type ShellRole } from './nav-config';

/** Bottom bar below 768 px: targets ≥ 44 px and safe-area inset. */
export function BottomNav({ role, badges = {} }: { role: ShellRole; badges?: NavBadges }) {
  const pathname = usePathname();
  const items = NAV_ITEMS[role];
  return (
    <nav
      aria-label="Principal"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface-raised pb-safe md:hidden"
    >
      <ul className="grid auto-cols-fr grid-flow-col">
        {items.map((item) => {
          const active = isItemActive(pathname, item);
          const badge = badgeLabel(item.badgeKey ? badges[item.badgeKey] : undefined);
          const Icon = item.icon;
          return (
            <li key={item.href} className="min-w-0">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'relative flex min-h-bottom-nav min-w-touch flex-col items-center justify-center gap-0.5 px-1 text-xs font-medium',
                  active ? 'text-primary' : 'text-text-muted hover:text-text',
                )}
              >
                <Icon className="size-5" aria-hidden="true" />
                <span className="max-w-full truncate">{item.shortLabel ?? item.label}</span>
                {item.shortLabel ? <span className="sr-only"> ({item.label})</span> : null}
                {badge ? (
                  <span className="absolute top-1 left-1/2 ml-2 rounded-full bg-danger px-1.5 text-xs leading-4 font-semibold text-on-danger">
                    {badge}
                    <span className="sr-only"> nuevas</span>
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
