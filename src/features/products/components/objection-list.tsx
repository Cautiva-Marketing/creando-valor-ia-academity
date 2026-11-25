'use client';

import { Pencil, Trash2 } from 'lucide-react';
import { startTransition, useActionState, useEffect, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
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
import { OBJECTION_CATEGORY_LABELS } from '@/features/practice/domain/labels';
import { deleteObjection, updateObjection } from '../actions';
import type { ObjectionRow } from '../queries';
import { ObjectionFields, useObjectionDraft } from './objection-form';

/** Inline edit: focus goes to the text on open and back to "Editar" on close. */
function EditObjection({
  productId,
  objection,
  onClose,
}: {
  productId: string;
  objection: ObjectionRow;
  onClose: (saved: boolean) => void;
}) {
  const { draft, setDraft, textRef } = useObjectionDraft({
    text: objection.text,
    category: objection.category ?? '',
  });
  const [state, action, pending] = useActionState(
    async (prev: ActionResult | null, formData: FormData) => {
      const result = await updateObjection(prev, formData);
      if (result.ok) {
        toast.success('Guardamos la objeción.');
        onClose(true);
      }
      return result;
    },
    null,
  );
  const failure = state && !state.ok ? state : null;
  useEffect(() => {
    textRef.current?.focus();
  }, [textRef]);

  return (
    <form
      noValidate
      aria-label="Editar objeción"
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        startTransition(() => action(formData));
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose(false);
      }}
    >
      {failure ? <FormAlert>{failure.message}</FormAlert> : null}
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="objectionId" value={objection.id} />
      <ObjectionFields
        idPrefix={`objecion-${objection.id}`}
        draft={draft}
        onChange={setDraft}
        errors={failure?.fieldErrors}
        textRef={textRef}
      />
      <div className="flex flex-wrap gap-3">
        <Button type="submit" loading={pending} loadingLabel="Guardando…">
          Guardar
        </Button>
        <Button type="button" variant="ghost" onClick={() => onClose(false)} disabled={pending}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

function DeleteObjection({ productId, objection }: { productId: string; objection: ObjectionRow }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(
    async (prev: ActionResult | null, formData: FormData) => {
      const result = await deleteObjection(prev, formData);
      if (result.ok) {
        toast.success('Eliminamos la objeción.');
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
        <Button
          variant="ghost"
          size="sm"
          className="text-danger"
          aria-label={`Eliminar objeción: ${objection.text}`}
        >
          <Trash2 aria-hidden="true" />
          Eliminar
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>¿Eliminar esta objeción?</DialogTitle>
          <DialogDescription>
            «{objection.text}». Las prácticas que ya la usaron conservan su texto.
          </DialogDescription>
        </DialogHeader>
        <form action={action} className="flex flex-col gap-4">
          {failure ? <FormAlert>{failure.message}</FormAlert> : null}
          <input type="hidden" name="productId" value={productId} />
          <input type="hidden" name="objectionId" value={objection.id} />
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
              loadingLabel="Eliminando…"
            >
              Eliminar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Objections of the product with inline edit and confirmed deletion (FR-006, FR-008). */
export function ObjectionList({
  productId,
  objections,
}: {
  productId: string;
  objections: ObjectionRow[];
}) {
  const [editing, setEditing] = useState<string | null>(null);
  // "Editar" button that takes the focus back when it mounts again. onClose runs inside the Server
  // Action transition, so the list re-renders only after the revalidation commits: a
  // requestAnimationFrame could fire before the button exists.
  const refocus = useRef<string | null>(null);

  return (
    <ol className="flex flex-col gap-3" aria-label="Objeciones registradas">
      {objections.map((objection) => (
        <li key={objection.id} className="rounded-lg border border-border bg-surface-raised p-4">
          {editing === objection.id ? (
            <EditObjection
              productId={productId}
              objection={objection}
              onClose={() => {
                refocus.current = objection.id;
                setEditing(null);
              }}
            />
          ) : (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex min-w-0 flex-col gap-1.5">
                <p className="break-words">{objection.text}</p>
                {objection.category ? (
                  <Badge className="w-fit">{OBJECTION_CATEGORY_LABELS[objection.category]}</Badge>
                ) : null}
              </div>
              <div className="flex shrink-0 gap-1">
                <Button
                  ref={(element) => {
                    if (element && refocus.current === objection.id) {
                      refocus.current = null;
                      element.focus();
                    }
                  }}
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditing(objection.id)}
                  aria-label={`Editar objeción: ${objection.text}`}
                >
                  <Pencil aria-hidden="true" />
                  Editar
                </Button>
                <DeleteObjection productId={productId} objection={objection} />
              </div>
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}
