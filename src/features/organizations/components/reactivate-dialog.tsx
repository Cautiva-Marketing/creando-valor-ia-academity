'use client';

import { useState, useTransition } from 'react';
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
import { toast } from '@/components/ui/sonner';
import { reactivateOrganization } from '../actions';

export function ReactivateDialog({
  organizationId,
  organizationName,
}: {
  organizationId: string;
  organizationName: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const confirm = () =>
    startTransition(async () => {
      const result = await reactivateOrganization({ organizationId });
      if (result.ok) toast.success(`Reactivamos ${organizationName}.`);
      else toast.error(result.message);
      setOpen(false);
    });

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm">
          Reactivar
          <span className="sr-only"> {organizationName}</span>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>¿Reactivar {organizationName}?</DialogTitle>
          <DialogDescription>
            Sus integrantes activos recuperarán el acceso de inmediato.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost" disabled={pending}>
              Cancelar
            </Button>
          </DialogClose>
          <Button onClick={confirm} loading={pending} loadingLabel="Reactivando…">
            Reactivar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
