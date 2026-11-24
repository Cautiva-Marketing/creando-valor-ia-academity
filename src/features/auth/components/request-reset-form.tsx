'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { FormAlert } from '@/components/ui/form-alert';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { requestPasswordReset } from '../actions';

export const RESET_CONFIRMATION =
  'Si existe una cuenta con ese correo, te enviamos un enlace para definir una nueva contraseña. Revisa tu bandeja de entrada y la carpeta de spam. El enlace vence en 60 minutos.';

export function RequestResetForm() {
  const [state, action, pending] = useActionState(requestPasswordReset, null);
  const failure = state && !state.ok ? state : null;

  if (state?.ok) {
    return (
      <div className="flex flex-col gap-4">
        <FormAlert tone="success" title="Revisa tu correo">
          {RESET_CONFIRMATION}
        </FormAlert>
        <Link
          href="/iniciar-sesion"
          className="inline-flex min-h-touch items-center text-primary underline underline-offset-4"
        >
          Volver a iniciar sesión
        </Link>
      </div>
    );
  }

  return (
    <form action={action} noValidate className="flex flex-col gap-5">
      <FormField
        id="email"
        label="Correo electrónico"
        description="Te enviaremos un enlace para definir una nueva contraseña."
        errors={failure?.fieldErrors?.email}
        required
      >
        {(control) => (
          <Input
            {...control}
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            defaultValue={failure?.values?.email}
          />
        )}
      </FormField>
      <Button type="submit" size="lg" loading={pending} loadingLabel="Enviando…">
        Enviar enlace
      </Button>
      <Link
        href="/iniciar-sesion"
        className="inline-flex min-h-touch items-center self-start text-primary underline underline-offset-4"
      >
        Volver a iniciar sesión
      </Link>
    </form>
  );
}
