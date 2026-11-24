import { ShieldAlert } from 'lucide-react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { SignOutButton } from '@/features/auth/components/sign-out-button';
import { isSuperadminAal2, operativeMemberships } from '@/lib/auth/context-types';
import { destinationFor } from '@/lib/auth/destination';
import { requireUser } from '@/lib/auth/guards';
import { publicEnv } from '@/lib/env.public';

export const metadata: Metadata = { title: 'Acceso suspendido' };

/** Session without an operative membership (FR-024). */
export default async function SuspendedPage() {
  const ctx = await requireUser('/acceso-suspendido');
  if (isSuperadminAal2(ctx) || operativeMemberships(ctx).length > 0) redirect(destinationFor(ctx));
  const support = publicEnv().NEXT_PUBLIC_SUPPORT_EMAIL;

  return (
    <Card className="items-center text-center">
      <ShieldAlert className="size-12 text-accent-strong" aria-hidden="true" />
      <h1 className="text-2xl">Tu acceso está suspendido</h1>
      <p className="text-text-muted">
        Por ahora no puedes usar Creando Valor IA™ con esta cuenta. Tus datos se conservan y el
        acceso puede reactivarse.
      </p>
      <p>
        Si necesitas ayuda, escríbenos a{' '}
        <a
          href={`mailto:${support}`}
          className="font-semibold text-primary underline underline-offset-4"
        >
          {support}
        </a>
        .
      </p>
      <SignOutButton variant="secondary" />
    </Card>
  );
}
