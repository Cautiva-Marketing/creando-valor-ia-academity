'use client';

import { LogOut, Monitor, Moon, RotateCcw, Sun, UserRound } from 'lucide-react';
import Link from 'next/link';
import { useTheme } from 'next-themes';
import { useTransition } from 'react';
import { Avatar } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { signOut } from '@/features/auth/actions';
import { resumeOnboarding } from '@/features/onboarding/actions';
import type { ShellRole } from './nav-config';

const THEMES = [
  { value: 'light', label: 'Claro', icon: Sun },
  { value: 'dark', label: 'Oscuro', icon: Moon },
  { value: 'system', label: 'Sistema', icon: Monitor },
] as const;

/**
 * Account menu (contracts/routes.md): Perfil · Tema (radio group) · Retomar onboarding (seller only)
 * · Cerrar sesión. Radix handles keyboard navigation and returns focus to the trigger on Escape.
 */
export function AccountMenu({
  userId,
  name,
  email,
  role,
}: {
  userId: string;
  name: string | null;
  email: string;
  role: ShellRole;
}) {
  const { theme, setTheme } = useTheme();
  const [pending, startTransition] = useTransition();

  return (
    // Non-modal: a modal menu aria-hides the rest of the page while it stays focusable (axe).
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger className="inline-flex min-h-touch min-w-touch items-center justify-center gap-2 rounded-full p-1 hover:bg-surface-sunken">
        {/* Text name instead of aria-label: the initials are decorative (aria-hidden). */}
        <Avatar userId={userId} name={name ?? email} size="sm" />
        <span className="sr-only">Menú de cuenta</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span className="truncate font-semibold text-text">{name ?? 'Tu cuenta'}</span>
          <span className="truncate text-sm font-normal text-text-muted">{email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/perfil">
            <UserRound className="size-4" aria-hidden="true" />
            Perfil
          </Link>
        </DropdownMenuItem>
        {role === 'vendedor' ? (
          <DropdownMenuItem
            disabled={pending}
            onSelect={(event) => {
              event.preventDefault();
              startTransition(async () => {
                await resumeOnboarding();
              });
            }}
          >
            <RotateCcw className="size-4" aria-hidden="true" />
            Retomar onboarding
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>Tema</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={theme ?? 'system'} onValueChange={setTheme}>
            {THEMES.map(({ value, label, icon: Icon }) => (
              <DropdownMenuRadioItem
                key={value}
                value={value}
                onSelect={(event) => event.preventDefault()}
              >
                <Icon className="size-4" aria-hidden="true" />
                {label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={pending}
          onSelect={(event) => {
            event.preventDefault();
            startTransition(async () => {
              await signOut();
            });
          }}
        >
          <LogOut className="size-4" aria-hidden="true" />
          {pending ? 'Cerrando sesión…' : 'Cerrar sesión'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
