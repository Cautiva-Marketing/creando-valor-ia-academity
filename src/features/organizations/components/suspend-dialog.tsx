'use client';

import { useActionState, useState } from 'react';
import { Button } from '@/components/ui/button';
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
import { FormAlert } from '@/components/ui/form-alert';
import { FormField } from '@/components/ui/form-field';
import { toast } from '@/components/ui/sonner';
import { Textarea } from '@/components/ui/textarea';
import type { ActionResult } from '@/lib/action-result';
import { cn } from '@/lib/utils';
import { suspendOrganization } from '../actions';
import { SUSPENSION_REASON_MAX } from '../schemas';

/** Suspension with a mandatory reason (1–500, not only spaces) and a live counter. */
export function SuspendDialog({
  organizationId,
  organizationName,
}: {
  organizationId: string;
  organizationName: string;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [state, action, pending] = useActionState(
    async (prev: ActionResult | null, formData: FormData) => {
      const result = await suspendOrganization(prev, formData);
      if (result.ok) {
        toast.success(`Suspendimos ${organizationName}. Sus integrantes ya no tienen acceso.`);
        setOpen(false);
        setReason('');
      }
      return result;
    },
    null,
  );
  const failure = state && !state.ok ? state : null;
  const counterId = `reason-count-${organizationId}`;

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-danger">
          Suspender
          <span className="sr-only"> {organizationName}</span>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>¿Suspender {organizationName}?</DialogTitle>
          <DialogDescription>
            Sus integrantes perderán el acceso en su siguiente acción. Podrás reactivarla cuando
            quieras.
          </DialogDescription>
        </DialogHeader>
        <form action={action} noValidate className="flex flex-col gap-4">
          {failure && !failure.fieldErrors ? <FormAlert>{failure.message}</FormAlert> : null}
          <input type="hidden" name="organizationId" value={organizationId} />
          <FormField
            id={`reason-${organizationId}`}
            label="Motivo"
            errors={failure?.fieldErrors?.reason}
            required
          >
            {(control) => (
              <Textarea
                {...control}
                aria-describedby={[control['aria-describedby'], counterId]
                  .filter(Boolean)
                  .join(' ')}
                name="reason"
                maxLength={SUSPENSION_REASON_MAX}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            )}
          </FormField>
          <p
            id={counterId}
            className={cn(
              '-mt-2 text-sm',
              reason.length >= SUSPENSION_REASON_MAX ? 'text-danger' : 'text-text-muted',
            )}
          >
            {reason.length} de {SUSPENSION_REASON_MAX} caracteres
          </p>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost" disabled={pending}>
                Cancelar
              </Button>
            </DialogClose>
            <Button
              type="submit"
              variant="destructive"
              loading={pending}
              loadingLabel="Suspendiendo…"
            >
              Suspender
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
