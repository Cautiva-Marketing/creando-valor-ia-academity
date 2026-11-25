'use client';

import { startTransition, useActionState, useRef, useState, type RefObject } from 'react';
import { Button } from '@/components/ui/button';
import { FormAlert } from '@/components/ui/form-alert';
import { FormField } from '@/components/ui/form-field';
import { fieldControlClass } from '@/components/ui/input';
import { toast } from '@/components/ui/sonner';
import { Textarea } from '@/components/ui/textarea';
import type { ActionResult } from '@/lib/action-result';
import { cn } from '@/lib/utils';
import { OBJECTION_CATEGORY_LABELS } from '@/features/practice/domain/labels';
import { createObjection } from '../actions';
import { OBJECTION_CATEGORIES, OBJECTION_LIMITS } from '../schemas';

export interface ObjectionDraft {
  text: string;
  category: string;
}

/** Text (5–300 with counter) + optional category; shared by the create and inline edit forms. */
export function ObjectionFields({
  idPrefix,
  draft,
  onChange,
  errors,
  textRef,
}: {
  idPrefix: string;
  draft: ObjectionDraft;
  onChange: (draft: ObjectionDraft) => void;
  errors?: Record<string, string[]>;
  textRef?: RefObject<HTMLTextAreaElement | null>;
}) {
  const counterId = `${idPrefix}-contador`;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <FormField id={`${idPrefix}-text`} label="Objeción" errors={errors?.text} required>
          {(control) => (
            <Textarea
              {...control}
              ref={textRef}
              aria-describedby={[control['aria-describedby'], counterId].filter(Boolean).join(' ')}
              name="text"
              rows={2}
              maxLength={OBJECTION_LIMITS.textMax}
              value={draft.text}
              onChange={(event) => onChange({ ...draft, text: event.target.value })}
            />
          )}
        </FormField>
        <p
          id={counterId}
          className={cn(
            'text-sm',
            draft.text.length >= OBJECTION_LIMITS.textMax ? 'text-danger' : 'text-text-muted',
          )}
        >
          {draft.text.length} de {OBJECTION_LIMITS.textMax} caracteres (mínimo{' '}
          {OBJECTION_LIMITS.textMin})
        </p>
      </div>
      <FormField id={`${idPrefix}-category`} label="Categoría (opcional)" errors={errors?.category}>
        {(control) => (
          <select
            {...control}
            name="category"
            value={draft.category}
            onChange={(event) => onChange({ ...draft, category: event.target.value })}
            className={cn(fieldControlClass, 'min-h-touch py-2 sm:max-w-xs')}
          >
            <option value="">Sin categoría</option>
            {OBJECTION_CATEGORIES.map((value) => (
              <option key={value} value={value}>
                {OBJECTION_CATEGORY_LABELS[value]}
              </option>
            ))}
          </select>
        )}
      </FormField>
    </div>
  );
}

/** New objection; suggestions fill `draft` from outside (FR-007). Disabled at 20 (FR-006). */
export function ObjectionCreateForm({
  productId,
  draft,
  onDraftChange,
  textRef,
  atLimit,
}: {
  productId: string;
  draft: ObjectionDraft;
  onDraftChange: (draft: ObjectionDraft) => void;
  textRef: RefObject<HTMLTextAreaElement | null>;
  atLimit: boolean;
}) {
  const [state, action, pending] = useActionState(
    async (prev: ActionResult | null, formData: FormData) => {
      const result = await createObjection(prev, formData);
      if (result.ok) {
        toast.success('Agregamos la objeción.');
        onDraftChange({ text: '', category: '' });
        requestAnimationFrame(() => textRef.current?.focus());
      }
      return result;
    },
    null,
  );
  const failure = state && !state.ok ? state : null;

  if (atLimit) {
    return (
      <FormAlert tone="info">Alcanzaste el máximo de 20 objeciones para este producto.</FormAlert>
    );
  }

  return (
    <form
      noValidate
      aria-label="Nueva objeción"
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        startTransition(() => action(formData));
      }}
    >
      {failure ? <FormAlert>{failure.message}</FormAlert> : null}
      <input type="hidden" name="productId" value={productId} />
      <ObjectionFields
        idPrefix="nueva-objecion"
        draft={draft}
        onChange={onDraftChange}
        errors={failure?.fieldErrors}
        textRef={textRef}
      />
      <div>
        <Button type="submit" loading={pending} loadingLabel="Guardando…">
          Agregar objeción
        </Button>
      </div>
    </form>
  );
}

/** Local draft state for an inline edit form. */
export function useObjectionDraft(initial: ObjectionDraft) {
  const [draft, setDraft] = useState(initial);
  const textRef = useRef<HTMLTextAreaElement>(null);
  return { draft, setDraft, textRef };
}
