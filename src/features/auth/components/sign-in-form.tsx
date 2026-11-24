'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { FormAlert } from '@/components/ui/form-alert';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { signIn } from '../actions';

export function SignInForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(signIn, null);
  const failure = state && !state.ok ? state : null;
  const generalError = failure && !failure.fieldErrors ? failure : null;

  return (
    <form
      action={action}
      noValidate
      className="flex flex-col gap-5"
      aria-describedby={generalError ? 'inicio-error' : undefined}
    >
      {generalError ? <FormAlert id="inicio-error">{generalError.message}</FormAlert> : null}
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <FormField
        id="email"
        label="Correo electrónico"
        errors={failure?.fieldErrors?.email}
        required
      >
        {(control) => (
          <Input
            {...control}
            name="email"
            type="email"
            inputMode="email"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            defaultValue={failure?.values?.email}
            key={failure?.values?.email}
          />
        )}
      </FormField>
      <FormField id="password" label="Contraseña" errors={failure?.fieldErrors?.password} required>
        {(control) => (
          <PasswordInput {...control} name="password" autoComplete="current-password" />
        )}
      </FormField>
      <div className="flex flex-col gap-3">
        <Button type="submit" size="lg" loading={pending} loadingLabel="Ingresando…">
          Iniciar sesión
        </Button>
        <Link
          href="/recuperar-contrasena"
          className="inline-flex min-h-touch items-center self-start text-primary underline underline-offset-4"
        >
          ¿Olvidaste tu contraseña?
        </Link>
        <p className="text-text-muted">
          ¿Aún no tienes cuenta?{' '}
          <Link
            href="/solicitar-acceso"
            className="inline-flex min-h-touch items-center text-primary underline underline-offset-4"
          >
            Solicitar acceso
          </Link>
        </p>
      </div>
    </form>
  );
}
