'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { FormAlert } from '@/components/ui/form-alert';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { PasswordRequirements } from '@/features/auth/components/password-requirements';
import { activateAccount } from '../activation-action';
import { InvalidInvitation } from './invalid-invitation';

interface ActivationFormProps {
  token: string;
  email: string;
  termsDocumentId: string;
  aiNoticeDocumentId: string;
}

function ConsentCheckbox({
  id,
  name,
  checked,
  onChange,
  errors,
  children,
}: {
  id: string;
  name: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  errors?: string[];
  children: React.ReactNode;
}) {
  const errorId = `${id}-error`;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-start gap-3">
        <Checkbox
          id={id}
          name={name}
          checked={checked}
          onCheckedChange={(value) => onChange(value === true)}
          aria-invalid={errors?.length ? true : undefined}
          aria-describedby={errors?.length ? errorId : undefined}
          aria-required
          className="mt-0.5"
        />
        <label htmlFor={id} className="text-base leading-snug">
          {children}
        </label>
      </div>
      {errors?.length ? (
        <p id={errorId} role="alert" className="ps-9 text-sm font-medium text-danger">
          {errors[0]}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Activation form (contracts/routes.md `/invitacion/[token]`). Controlled fields keep what the person
 * typed after a failed submission (React resets uncontrolled fields); the password never comes back
 * from the server.
 */
export function ActivationForm({
  token,
  email,
  termsDocumentId,
  aiNoticeDocumentId,
}: ActivationFormProps) {
  const [state, action, pending] = useActionState(activateAccount, null);
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [acceptAiNotice, setAcceptAiNotice] = useState(false);
  const failure = state && !state.ok ? state : null;
  const legalError = failure?.fieldErrors?.legal;

  // A legal update requires accepting the new versions again (state adjusted during render).
  const [handledState, setHandledState] = useState(state);
  if (state !== handledState) {
    setHandledState(state);
    if (legalError) {
      setAcceptTerms(false);
      setAcceptAiNotice(false);
    }
  }

  if (failure?.code === 'invitation_invalid') {
    const reason = failure.details?.reason;
    return (
      <InvalidInvitation
        reason={
          reason === 'expired' || reason === 'revoked' || reason === 'used' ? reason : 'invalid'
        }
      />
    );
  }

  const generalError = failure && !failure.fieldErrors ? failure : null;

  return (
    <form action={action} noValidate className="flex flex-col gap-5">
      {generalError ? (
        <FormAlert>
          <p>{generalError.message}</p>
          {generalError.code === 'conflict' ? (
            <Link href="/iniciar-sesion" className="text-primary underline underline-offset-4">
              Iniciar sesión
            </Link>
          ) : null}
          {generalError.referenceId ? (
            <p className="text-sm">Referencia: {generalError.referenceId}</p>
          ) : null}
        </FormAlert>
      ) : null}
      {legalError ? (
        <FormAlert tone="info" title="Documentos actualizados">
          {legalError[0]}
        </FormAlert>
      ) : null}

      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="termsDocumentId" value={termsDocumentId} />
      <input type="hidden" name="aiNoticeDocumentId" value={aiNoticeDocumentId} />

      <FormField id="email" label="Correo" description="Es el correo al que llegó tu invitación.">
        {(control) => (
          <Input
            {...control}
            type="email"
            name="username"
            value={email}
            readOnly
            autoComplete="username"
          />
        )}
      </FormField>
      <FormField
        id="fullName"
        label="Nombre completo"
        errors={failure?.fieldErrors?.fullName}
        required
      >
        {(control) => (
          <Input
            {...control}
            name="fullName"
            autoComplete="name"
            maxLength={80}
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
          />
        )}
      </FormField>
      <FormField id="password" label="Contraseña" errors={failure?.fieldErrors?.password} required>
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

      <fieldset className="flex flex-col gap-3">
        <legend className="sr-only">Aceptaciones</legend>
        <ConsentCheckbox
          id="acceptTerms"
          name="acceptTerms"
          checked={acceptTerms}
          onChange={setAcceptTerms}
          errors={failure?.fieldErrors?.acceptTerms}
        >
          Acepto los{' '}
          <Link
            href="/terminos"
            target="_blank"
            className="text-primary underline underline-offset-4"
          >
            términos de uso
            <span className="sr-only"> (se abre en una pestaña nueva)</span>
          </Link>
          .
        </ConsentCheckbox>
        <ConsentCheckbox
          id="acceptAiNotice"
          name="acceptAiNotice"
          checked={acceptAiNotice}
          onChange={setAcceptAiNotice}
          errors={failure?.fieldErrors?.acceptAiNotice}
        >
          Leí y acepto el{' '}
          <Link
            href="/aviso-ia"
            target="_blank"
            className="text-primary underline underline-offset-4"
          >
            aviso de uso de IA
            <span className="sr-only"> (se abre en una pestaña nueva)</span>
          </Link>
          .
        </ConsentCheckbox>
      </fieldset>

      <Button
        type="submit"
        size="lg"
        loading={pending}
        loadingLabel="Activando…"
        disabled={pending}
      >
        Activar mi cuenta
      </Button>
    </form>
  );
}
