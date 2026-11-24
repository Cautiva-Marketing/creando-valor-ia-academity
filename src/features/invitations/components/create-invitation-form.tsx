'use client';

import { useRouter } from 'next/navigation';
import { useActionState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { FormAlert } from '@/components/ui/form-alert';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/sonner';
import { createInvitation } from '../actions';
import { ResendInvitationDialog } from './invitation-dialogs';

export function CreateInvitationForm({
  idempotencyKey,
  defaultEmail,
  accessRequestId,
}: {
  idempotencyKey: string;
  defaultEmail?: string;
  accessRequestId?: string;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(createInvitation, null);
  const failure = state && !state.ok ? state : null;
  const values = failure?.values;

  useEffect(() => {
    if (!state?.ok) return;
    if (state.data.sendStatus === 'failed') {
      toast.warning(
        'Creamos la invitación, pero no pudimos enviar el correo. Usa «Reintentar envío».',
      );
    } else {
      toast.success('Invitación enviada.');
    }
    router.push('/admin/invitaciones');
  }, [state, router]);

  const openInvitation =
    failure?.details?.reason === 'open_invitation' &&
    (failure.details.status === 'pending' || failure.details.status === 'expired')
      ? failure.details.invitationId
      : undefined;

  return (
    <form action={action} noValidate className="flex flex-col gap-5">
      {failure && !failure.fieldErrors ? (
        <FormAlert
          title={failure.code === 'conflict' ? 'No se puede crear la invitación' : undefined}
        >
          <p>{failure.message}</p>
          {openInvitation ? (
            <div className="mt-3">
              <ResendInvitationDialog
                invitationId={openInvitation}
                email={values?.email ?? ''}
                onDone={() => router.push('/admin/invitaciones')}
              />
            </div>
          ) : null}
        </FormAlert>
      ) : null}
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      {accessRequestId ? (
        <input type="hidden" name="accessRequestId" value={accessRequestId} />
      ) : null}
      <FormField
        id="email"
        label="Correo de la persona invitada"
        errors={failure?.fieldErrors?.email}
        required
      >
        {(control) => (
          <Input
            {...control}
            name="email"
            type="email"
            inputMode="email"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            defaultValue={values?.email ?? defaultEmail}
            key={values?.email ?? defaultEmail}
          />
        )}
      </FormField>
      <FormField
        id="expiresInDays"
        label="Plazo de la invitación (días)"
        description="Entre 1 y 30 días. Por defecto, 7."
        errors={failure?.fieldErrors?.expiresInDays}
        required
      >
        {(control) => (
          <Input
            {...control}
            name="expiresInDays"
            type="number"
            inputMode="numeric"
            min={1}
            max={30}
            step={1}
            defaultValue={values?.expiresInDays ?? '7'}
            className="max-w-32"
          />
        )}
      </FormField>
      <Button
        type="submit"
        size="lg"
        loading={pending}
        loadingLabel="Enviando…"
        className="self-start"
      >
        Enviar invitación
      </Button>
    </form>
  );
}
