'use client';

import { useState, useTransition } from 'react';
import { Button, type ButtonProps } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { toast } from '@/components/ui/sonner';
import { resendInvitation, revokeInvitation } from '../actions';

/**
 * Resend / "Reintentar envío": every opening of the dialog generates its own idempotency key, so a
 * double click on "Reenviar" sends a single email (contracts/server-actions.md).
 */
export function ResendInvitationDialog({
  invitationId,
  email,
  retry = false,
  trigger,
  onDone,
}: {
  invitationId: string;
  email: string;
  retry?: boolean;
  trigger?: ButtonProps;
  onDone?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState<string>('');
  const [pending, startTransition] = useTransition();
  const label = retry ? 'Reintentar envío' : 'Reenviar';

  const confirm = () =>
    startTransition(async () => {
      const result = await resendInvitation({ invitationId, idempotencyKey: key });
      if (!result.ok) {
        toast.error(result.message);
      } else if (result.data.sendStatus === 'failed') {
        toast.warning('No pudimos enviar el correo. Inténtalo de nuevo con «Reintentar envío».');
      } else {
        toast.success(
          `Enviamos una invitación nueva a ${email}. El enlace anterior ya no funciona.`,
        );
      }
      setOpen(false);
      onDone?.();
    });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setKey(crypto.randomUUID());
        if (!pending) setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm" {...trigger}>
          {label}
          <span className="sr-only"> la invitación de {email}</span>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{retry ? '¿Reintentar el envío?' : '¿Reenviar la invitación?'}</DialogTitle>
          <DialogDescription>
            Enviaremos un enlace nuevo a <strong className="text-text">{email}</strong> con el plazo
            reiniciado. El enlace anterior dejará de funcionar.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost" disabled={pending}>
              Cancelar
            </Button>
          </DialogClose>
          <Button onClick={confirm} loading={pending} loadingLabel="Enviando…" disabled={!key}>
            {label}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RevokeInvitationDialog({
  invitationId,
  email,
}: {
  invitationId: string;
  email: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const confirm = () =>
    startTransition(async () => {
      const result = await revokeInvitation({ invitationId });
      if (result.ok) toast.success(`Revocamos la invitación de ${email}.`);
      else toast.error(result.message);
      setOpen(false);
    });

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-danger">
          Revocar
          <span className="sr-only"> la invitación de {email}</span>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>¿Revocar la invitación?</DialogTitle>
          <DialogDescription>
            El enlace enviado a <strong className="text-text">{email}</strong> dejará de funcionar.
            Podrás crear una invitación nueva más adelante.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost" disabled={pending}>
              Cancelar
            </Button>
          </DialogClose>
          <Button
            variant="destructive"
            onClick={confirm}
            loading={pending}
            loadingLabel="Revocando…"
          >
            Revocar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
