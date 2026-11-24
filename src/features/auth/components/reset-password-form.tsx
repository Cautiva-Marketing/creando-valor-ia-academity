'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import { Button } from '@/components/ui/button';
import { FormAlert } from '@/components/ui/form-alert';
import { FormField } from '@/components/ui/form-field';
import { PasswordInput } from '@/components/ui/password-input';
import { resetPassword } from '../actions';
import { PasswordRequirements } from './password-requirements';

export function ResetPasswordForm({ email }: { email: string }) {
  const [state, action, pending] = useActionState(resetPassword, null);
  const [password, setPassword] = useState('');
  const failure = state && !state.ok ? state : null;
  const generalError = failure && !failure.fieldErrors ? failure : null;

  return (
    <form action={action} noValidate className="flex flex-col gap-5">
      {generalError ? (
        <FormAlert>
          {generalError.message}{' '}
          {generalError.code === 'unauthorized' ? (
            <Link
              href="/recuperar-contrasena"
              className="text-primary underline underline-offset-4"
            >
              Pedir otro enlace
            </Link>
          ) : null}
        </FormAlert>
      ) : null}
      {/* Helps password managers associate the new password with the account. */}
      <input type="email" name="username" autoComplete="username" value={email} readOnly hidden />
      <FormField
        id="password"
        label="Nueva contraseña"
        errors={failure?.fieldErrors?.password}
        required
      >
        {(control) => (
          <PasswordInput
            {...control}
            aria-describedby={[control['aria-describedby'], 'requisitos-contrasena']
              .filter(Boolean)
              .join(' ')}
            name="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        )}
      </FormField>
      <PasswordRequirements id="requisitos-contrasena" password={password} email={email} />
      <Button type="submit" size="lg" loading={pending} loadingLabel="Guardando…">
        Guardar contraseña
      </Button>
    </form>
  );
}
