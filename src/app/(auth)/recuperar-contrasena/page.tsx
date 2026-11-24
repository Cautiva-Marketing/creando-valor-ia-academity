import type { Metadata } from 'next';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FormAlert } from '@/components/ui/form-alert';
import { RequestResetForm } from '@/features/auth/components/request-reset-form';
import { redirectIfSignedIn } from '@/features/auth/redirect-if-signed-in';

export const metadata: Metadata = { title: 'Recuperar contraseña' };

export default async function RequestResetPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { estado } = await searchParams;
  await redirectIfSignedIn();

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h1" className="text-2xl">
          Recupera tu contraseña
        </CardTitle>
        <CardDescription>Escribe el correo de tu cuenta.</CardDescription>
      </CardHeader>
      {estado === 'enlace-invalido' ? (
        <FormAlert title="El enlace no es válido">
          El enlace ya se usó o venció. Pide uno nuevo a continuación.
        </FormAlert>
      ) : null}
      <RequestResetForm />
    </Card>
  );
}
