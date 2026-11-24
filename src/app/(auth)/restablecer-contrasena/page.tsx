import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ResetPasswordForm } from '@/features/auth/components/reset-password-form';
import { isRecoverySession } from '@/features/auth/recovery-session';
import { getRequestContext } from '@/lib/auth/request-context';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Nueva contraseña' };

/** Requires the session created by the recovery link (verifyOtp type=recovery). */
export default async function ResetPasswordPage() {
  const ctx = await getRequestContext();
  if (!ctx || !(await isRecoverySession(await createClient()))) {
    redirect('/recuperar-contrasena?estado=enlace-invalido');
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h1" className="text-2xl">
          Define una nueva contraseña
        </CardTitle>
        <CardDescription>
          Al guardarla cerraremos tu sesión en los demás dispositivos.
        </CardDescription>
      </CardHeader>
      <ResetPasswordForm email={ctx.email} />
    </Card>
  );
}
