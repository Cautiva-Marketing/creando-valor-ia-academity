import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { MfaVerifyForm } from '@/features/auth/components/mfa-verify-form';
import { SignOutButton } from '@/features/auth/components/sign-out-button';
import { destinationFor } from '@/lib/auth/destination';
import { requireUser } from '@/lib/auth/guards';
import { safeNext } from '@/lib/auth/safe-next';

export const metadata: Metadata = { title: 'Verificación en dos pasos' };

/** Superadmin aal1 with a verified factor (FR-023, FR-025). */
export default async function MfaVerifyPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const next = safeNext(typeof params.next === 'string' ? params.next : null) ?? undefined;
  const ctx = await requireUser('/admin/invitaciones');
  if (!ctx.is_superadmin_account || ctx.aal === 'aal2' || !ctx.has_verified_factor) {
    redirect(destinationFor(ctx, next));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h1" className="text-2xl">
          Verificación en dos pasos
        </CardTitle>
        <CardDescription>Escribe el código que muestra tu app de autenticación.</CardDescription>
      </CardHeader>
      <MfaVerifyForm next={next} />
      <div className="border-t border-border pt-4">
        <SignOutButton variant="link" />
      </div>
    </Card>
  );
}
