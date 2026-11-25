'use client';

import { Archive, ArchiveRestore } from 'lucide-react';
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
import { toast } from '@/components/ui/sonner';
import type { ActionResult } from '@/lib/action-result';
import { setProductStatus } from '../actions';

/** Archive / reactivate with confirmation and toast (FR-003, T051). */
export function ProductStatusDialog({
  productId,
  productName,
  status,
}: {
  productId: string;
  productName: string;
  status: 'active' | 'archived';
}) {
  const [open, setOpen] = useState(false);
  const archiving = status === 'active';
  const [state, action, pending] = useActionState(
    async (prev: ActionResult | null, formData: FormData) => {
      const result = await setProductStatus(prev, formData);
      if (result.ok) {
        toast.success(archiving ? `Archivamos ${productName}.` : `Reactivamos ${productName}.`);
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
        <Button variant="secondary">
          {archiving ? <Archive aria-hidden="true" /> : <ArchiveRestore aria-hidden="true" />}
          {archiving ? 'Archivar' : 'Reactivar'}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {archiving ? `¿Archivar ${productName}?` : `¿Reactivar ${productName}?`}
          </DialogTitle>
          <DialogDescription>
            {archiving
              ? 'No podrás usarlo en prácticas nuevas. Tus prácticas y resultados anteriores se mantienen y puedes reactivarlo cuando quieras.'
              : 'Volverá a tu lista de productos activos y podrás practicar con él.'}
          </DialogDescription>
        </DialogHeader>
        <form action={action} className="flex flex-col gap-4">
          {failure ? <FormAlert>{failure.message}</FormAlert> : null}
          <input type="hidden" name="productId" value={productId} />
          <input type="hidden" name="status" value={archiving ? 'archived' : 'active'} />
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost" disabled={pending}>
                Cancelar
              </Button>
            </DialogClose>
            <Button
              type="submit"
              loading={pending}
              loadingLabel={archiving ? 'Archivando…' : 'Reactivando…'}
            >
              {archiving ? 'Archivar' : 'Reactivar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
