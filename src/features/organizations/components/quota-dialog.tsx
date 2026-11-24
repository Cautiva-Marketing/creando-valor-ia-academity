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
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/sonner';
import type { ActionResult } from '@/lib/action-result';
import { updateQuota } from '../actions';

export function QuotaDialog({
  organizationId,
  organizationName,
  dailyLimit,
  monthlyLimit,
}: {
  organizationId: string;
  organizationName: string;
  dailyLimit: number;
  monthlyLimit: number;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(
    async (prev: ActionResult | null, formData: FormData) => {
      const result = await updateQuota(prev, formData);
      if (result.ok) {
        toast.success(`Guardamos la cuota de ${organizationName}.`);
        setOpen(false);
      }
      return result;
    },
    null,
  );
  const failure = state && !state.ok ? state : null;

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm">
          Editar cuota
          <span className="sr-only"> de {organizationName}</span>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cuota de {organizationName}</DialogTitle>
          <DialogDescription>
            Simulaciones permitidas por día y por mes. El diario no puede superar al mensual.
          </DialogDescription>
        </DialogHeader>
        <form action={action} noValidate className="flex flex-col gap-4">
          {failure && !failure.fieldErrors ? <FormAlert>{failure.message}</FormAlert> : null}
          <input type="hidden" name="organizationId" value={organizationId} />
          <FormField
            id={`daily-${organizationId}`}
            label="Límite diario"
            errors={failure?.fieldErrors?.dailyLimit}
            required
          >
            {(control) => (
              <Input
                {...control}
                name="dailyLimit"
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                defaultValue={failure?.values?.dailyLimit ?? String(dailyLimit)}
                key={`d-${failure?.values?.dailyLimit ?? dailyLimit}`}
                className="max-w-40"
              />
            )}
          </FormField>
          <FormField
            id={`monthly-${organizationId}`}
            label="Límite mensual"
            errors={failure?.fieldErrors?.monthlyLimit}
            required
          >
            {(control) => (
              <Input
                {...control}
                name="monthlyLimit"
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                defaultValue={failure?.values?.monthlyLimit ?? String(monthlyLimit)}
                key={`m-${failure?.values?.monthlyLimit ?? monthlyLimit}`}
                className="max-w-40"
              />
            )}
          </FormField>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost" disabled={pending}>
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" loading={pending} loadingLabel="Guardando…">
              Guardar cuota
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
