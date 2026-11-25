'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { NAV_ITEMS, badgeLabel, isItemActive, type NavBadges, type ShellRole } from './nav-config';

/** Top navigation from 768 px (`aria-current="page"`). */
export function DesktopNav({ role, badges = {} }: { role: ShellRole; badges?: NavBadges }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Principal" className="hidden md:block">
      <ul className="flex items-center gap-1">
        {NAV_ITEMS[role].map((item) => {
          const active = isItemActive(pathname, item);
          const badge = badgeLabel(item.badgeKey ? badges[item.badgeKey] : undefined);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'inline-flex min-h-touch items-center gap-2 rounded-md px-3 text-base font-medium',
                  active
                    ? 'bg-surface-sunken text-primary'
                    : 'text-text-muted hover:bg-surface-sunken hover:text-text',
                )}
              >
                <Icon className="size-4" aria-hidden="true" />
                {item.label}
                {badge ? (
                  <span className="rounded-full bg-danger px-1.5 text-xs font-semibold text-on-danger">
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
