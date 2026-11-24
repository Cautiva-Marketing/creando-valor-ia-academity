'use client';

import { CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { useActionState, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { FormAlert } from '@/components/ui/form-alert';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { submitAccessRequest } from '../actions';
import { ACCESS_REQUEST_MESSAGE_MAX } from '../schemas';

/**
 * Access request form (contracts/routes.md `/solicitar-acceso`). Controlled fields keep what was typed
 * after an error; `startedAt` (signed) and `privacyDocumentId` come from the server render.
 */
export function AccessRequestForm({
  startedAt,
  privacyDocumentId,
}: {
  startedAt: string;
  privacyDocumentId: string;
}) {
  const [state, action, pending] = useActionState(submitAccessRequest, null);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [companyOrRole, setCompanyOrRole] = useState('');
  const [message, setMessage] = useState('');
  const [acceptPrivacy, setAcceptPrivacy] = useState(false);
  const [privacyId, setPrivacyId] = useState(privacyDocumentId);
  const failure = state && !state.ok ? state : null;
  const privacyError = failure?.fieldErrors?.acceptPrivacy;

  // A policy update must be accepted again: uncheck and switch to the current version (during render).
  const [handledState, setHandledState] = useState(state);
  if (state !== handledState) {
    setHandledState(state);
    const updated = failure?.details?.privacyDocumentId;
    if (updated) {
      setPrivacyId(updated);
      setAcceptPrivacy(false);
    }
  }

  if (state?.ok) {
    return (
      <div
        role="status"
        className="flex flex-col items-start gap-3 rounded-lg border border-border bg-surface-raised p-6"
      >
        <CheckCircle2 className="size-8 text-success" aria-hidden="true" />
        <h2 className="text-2xl">Recibimos tu solicitud</h2>
        <p className="text-text-muted">
          La revisaremos y, si es aprobada, te enviaremos una invitación a tu correo para activar tu
          cuenta.
        </p>
        <Button asChild variant="secondary">
          <Link href="/">Volver al inicio</Link>
        </Button>
      </div>
    );
  }

  const generalError = failure && !failure.fieldErrors ? failure : null;
  const privacyErrorId = 'acceptPrivacy-error';
  const counterId = 'message-count';

  return (
    <form action={action} noValidate className="flex flex-col gap-5">
      {generalError ? <FormAlert>{generalError.message}</FormAlert> : null}

      <FormField id="fullName" label="Nombre" errors={failure?.fieldErrors?.fullName} required>
        {(control) => (
          <Input
            {...control}
            name="fullName"
            autoComplete="name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
        )}
      </FormField>
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
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        )}
      </FormField>
      <FormField
        id="companyOrRole"
        label="Empresa o cargo"
        description="Opcional."
        errors={failure?.fieldErrors?.companyOrRole}
      >
        {(control) => (
          <Input
            {...control}
            name="companyOrRole"
            autoComplete="organization"
            maxLength={120}
            value={companyOrRole}
            onChange={(e) => setCompanyOrRole(e.target.value)}
          />
        )}
      </FormField>
      <FormField
        id="message"
        label="¿Qué te gustaría practicar?"
        description="Opcional."
        errors={failure?.fieldErrors?.message}
      >
        {(control) => (
          <Textarea
            {...control}
            aria-describedby={[control['aria-describedby'], counterId].filter(Boolean).join(' ')}
            name="message"
            maxLength={ACCESS_REQUEST_MESSAGE_MAX}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
        )}
      </FormField>
      <p
        id={counterId}
        className={cn(
          '-mt-3 text-sm',
          message.length >= ACCESS_REQUEST_MESSAGE_MAX ? 'text-danger' : 'text-text-muted',
        )}
      >
        {message.length} de {ACCESS_REQUEST_MESSAGE_MAX} caracteres
      </p>

      <div className="flex flex-col gap-1">
        <div className="flex items-start gap-3">
          <Checkbox
            id="acceptPrivacy"
            name="acceptPrivacy"
            checked={acceptPrivacy}
            onCheckedChange={(value) => setAcceptPrivacy(value === true)}
            aria-invalid={privacyError ? true : undefined}
            aria-describedby={privacyError ? privacyErrorId : undefined}
            aria-required
            className="mt-0.5"
          />
          <label htmlFor="acceptPrivacy" className="text-base leading-snug">
            Leí y acepto la{' '}
            <Link
              href="/privacidad"
              target="_blank"
              className="text-primary underline underline-offset-4"
            >
              política de privacidad
            </Link>
          </label>
        </div>
        {privacyError ? (
          <p id={privacyErrorId} role="alert" className="ps-9 text-sm font-medium text-danger">
            {privacyError[0]}
          </p>
        ) : null}
      </div>

      <input type="hidden" name="privacyDocumentId" value={privacyId} />
      <input type="hidden" name="startedAt" value={startedAt} />
      {/* Honeypot: invisible and hidden from assistive technology; people never fill it. */}
      <div className="sr-only" aria-hidden="true">
        <label htmlFor="website">No completes este campo</label>
        <input
          id="website"
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          defaultValue=""
        />
      </div>

      <Button type="submit" size="lg" loading={pending} loadingLabel="Enviando…">
        Enviar solicitud
      </Button>
    </form>
  );
}
