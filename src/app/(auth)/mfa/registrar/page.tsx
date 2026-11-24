import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { MfaEnrollForm } from '@/features/auth/components/mfa-enroll-form';
import { SignOutButton } from '@/features/auth/components/sign-out-button';
import { destinationFor } from '@/lib/auth/destination';
import { requireUser } from '@/lib/auth/guards';

export const metadata: Metadata = { title: 'Configura la verificación en dos pasos' };

/** Superadmin aal1 without a verified factor; the only way out is signing out (FR-025). */
export default async function MfaEnrollPage() {
  const ctx = await requireUser('/admin/invitaciones');
  if (!ctx.is_superadmin_account || ctx.aal === 'aal2' || ctx.has_verified_factor) {
    redirect(destinationFor(ctx));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h1" className="text-2xl">
          Configura la verificación en dos pasos
        </CardTitle>
        <CardDescription>
          Las cuentas de administración siempre entran con un código de tu app de autenticación.
        </CardDescription>
      </CardHeader>
      <MfaEnrollForm />
      <div className="border-t border-border pt-4">
        <SignOutButton variant="link" />
      </div>
    </Card>
  );
}
