import type { Metadata } from 'next';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { SignInForm } from '@/features/auth/components/sign-in-form';
import { redirectIfSignedIn } from '@/features/auth/redirect-if-signed-in';
import { safeNext } from '@/lib/auth/safe-next';

export const metadata: Metadata = { title: 'Iniciar sesión' };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const next = safeNext(typeof params.next === 'string' ? params.next : null) ?? undefined;
  await redirectIfSignedIn(next);

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h1" className="text-2xl">
          Inicia sesión
        </CardTitle>
        <CardDescription>Entra con el correo y la contraseña de tu cuenta.</CardDescription>
      </CardHeader>
      <SignInForm next={next} />
    </Card>
  );
}
