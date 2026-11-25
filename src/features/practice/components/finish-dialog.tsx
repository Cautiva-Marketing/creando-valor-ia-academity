'use client';

import { Flag } from 'lucide-react';
import { useRouter } from 'next/navigation';
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
import { FormAlert } from '@/components/ui/form-alert';
import { cn } from '@/lib/utils';
import { finishPractice } from '../actions';

/**
 * "Terminar y evaluar" (T123; FR-028e) with confirmation. Disabled with an explanation when there is
 * no seller message yet or the buyer is answering; SQL repeats both checks.
 */
export function FinishDialog({
  sessionId,
  sellerMessageCount,
  turnInProgress = false,
  className,
}: {
  sessionId: string;
  /** null when unknown (e.g. on Hoy): the action decides. */
  sellerMessageCount: number | null;
  turnInProgress?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const reason =
    sellerMessageCount === 0
      ? 'Envía al menos un mensaje para poder terminar.'
      : turnInProgress
        ? 'Espera la respuesta del cliente para terminar.'
        : null;

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (next) setError(null);
        }}
      >
        <DialogTrigger asChild>
          <Button
            variant="secondary"
            disabled={reason != null}
            aria-describedby={reason ? `finish-help-${sessionId}` : undefined}
          >
            <Flag aria-hidden="true" />
            Terminar y evaluar
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Terminar la práctica?</DialogTitle>
            <DialogDescription>
              Se evaluará la conversación hasta aquí y ya no podrás enviar más mensajes.
            </DialogDescription>
          </DialogHeader>
          {error ? <FormAlert>{error}</FormAlert> : null}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">Seguir conversando</Button>
            </DialogClose>
            <Button
              loading={pending}
              loadingLabel="Terminando…"
              onClick={() => {
                const formData = new FormData();
                formData.set('sessionId', sessionId);
                startTransition(async () => {
                  const result = await finishPractice(null, formData);
                  if (!result.ok) {
                    setError(result.message);
                    return;
                  }
                  setOpen(false);
                  router.push(`/practicas/${sessionId}`);
                  router.refresh();
                });
              }}
            >
              Terminar y evaluar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {reason ? (
        <p id={`finish-help-${sessionId}`} className="text-sm text-text-muted">
          {reason}
        </p>
      ) : null}
    </div>
  );
}
