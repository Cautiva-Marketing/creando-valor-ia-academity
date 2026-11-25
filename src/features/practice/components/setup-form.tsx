'use client';

import { Loader2, PlusCircle } from 'lucide-react';
import Link from 'next/link';
import { startTransition, useActionState, useEffect, useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { FormAlert } from '@/components/ui/form-alert';
import { fieldControlClass } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';
import type { ActionResult } from '@/lib/action-result';
import { cn } from '@/lib/utils';
import { configurePractice } from '../actions';
import { CAUTIVA_STAGES, cautivaLabel, type CautivaStage } from '../domain/cautiva';
import { DIFFICULTIES } from '../domain/difficulty';
import { OBJECTION_CATEGORY_LABELS, SECTOR_LABELS } from '../domain/labels';
import type { SetupProduct } from '../queries';
import { AiNotice } from './ai-notice';

/**
 * Practice setup (US3, FR-009–FR-016): product, 1–3 objections, difficulty with its description,
 * hints (on by default) and an optional Cautiva focus stage. While the persona is generated the form
 * shows an accessible progress message. The draft survives a trip to add objections
 * (sessionStorage, per tab).
 */
const MAX_OBJECTIONS = 3;
const DRAFT_KEY = 'practicar:borrador';

interface Draft {
  productId: string;
  difficulty: string;
  hintsEnabled: boolean;
  focusStage: string;
}

function readDraft(): Partial<Draft> {
  try {
    const raw = window.sessionStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as Partial<Draft>) : {};
  } catch {
    return {};
  }
}

function writeDraft(draft: Draft) {
  try {
    window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // Storage unavailable (private mode): the draft is a convenience only.
  }
}

export function SetupForm({
  products,
  defaultProductId,
  defaultFocus,
  hasConfigured,
  disabled = false,
}: {
  products: SetupProduct[];
  defaultProductId?: string;
  defaultFocus?: CautivaStage;
  /** A configured practice exists and will be discarded (FR-015). */
  hasConfigured: boolean;
  /** Quota or setup caps exhausted: the form is shown but cannot be sent. */
  disabled?: boolean;
}) {
  const initialProduct =
    products.find((p) => p.id === defaultProductId)?.id ??
    products.find((p) => p.objections.length > 0)?.id ??
    products[0]?.id ??
    '';
  const [productId, setProductId] = useState(initialProduct);
  const [objectionIds, setObjectionIds] = useState<string[]>([]);
  const [difficulty, setDifficulty] = useState('3');
  const [hintsEnabled, setHintsEnabled] = useState(true);
  const [focusStage, setFocusStage] = useState<string>(defaultFocus ?? '');
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [restored, setRestored] = useState(false);
  const ids = useId();

  // Restore the draft once (URL parameters win over it).
  useEffect(() => {
    const draft = readDraft();
    /* eslint-disable react-hooks/set-state-in-effect -- one-time restore from sessionStorage */
    if (!defaultProductId && draft.productId && products.some((p) => p.id === draft.productId)) {
      setProductId(draft.productId);
    }
    if (draft.difficulty && /^[1-5]$/.test(draft.difficulty)) setDifficulty(draft.difficulty);
    if (typeof draft.hintsEnabled === 'boolean') setHintsEnabled(draft.hintsEnabled);
    if (!defaultFocus && draft.focusStage !== undefined) setFocusStage(draft.focusStage);
    setRestored(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [defaultProductId, defaultFocus, products]);

  useEffect(() => {
    if (restored) writeDraft({ productId, difficulty, hintsEnabled, focusStage });
  }, [restored, productId, difficulty, hintsEnabled, focusStage]);

  const [state, action, pending] = useActionState(
    (prev: ActionResult | null, formData: FormData) => configurePractice(prev, formData),
    null,
  );
  const failure = state && !state.ok ? state : null;
  const errors = failure?.fieldErrors;

  const product = products.find((p) => p.id === productId);
  const selectedDifficulty = DIFFICULTIES.find((d) => String(d.level) === difficulty);
  const atLimit = objectionIds.length >= MAX_OBJECTIONS;
  const canSubmit = !disabled && !pending && Boolean(product) && objectionIds.length > 0;

  const toggleObjection = (id: string, checked: boolean) =>
    setObjectionIds((current) =>
      checked ? [...current, id].slice(0, MAX_OBJECTIONS) : current.filter((x) => x !== id),
    );

  return (
    <form
      noValidate
      aria-label="Configurar práctica"
      aria-busy={pending || undefined}
      className="flex flex-col gap-6"
      // onSubmit instead of `action`: React resets forms after an action and Radix controls would
      // lose their values.
      onSubmit={(event) => {
        event.preventDefault();
        if (!canSubmit) return;
        const formData = new FormData(event.currentTarget);
        startTransition(() => action(formData));
      }}
    >
      <AiNotice variant="setup" />
      {hasConfigured ? (
        <FormAlert tone="info">
          Ya tienes una práctica configurada sin comenzar. Si preparas otra, la anterior se
          descartará.
        </FormAlert>
      ) : null}
      {failure ? (
        <FormAlert>
          <span>{failure.message}</span>
          {failure.code === 'active_session' && failure.details?.sessionId ? (
            <>
              {' '}
              <Link
                href={`/practicas/${failure.details.sessionId}`}
                className="font-semibold text-primary underline underline-offset-4"
              >
                Retomar la práctica
              </Link>
            </>
          ) : null}
        </FormAlert>
      ) : null}

      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <input type="hidden" name="hintsEnabled" value={hintsEnabled ? 'on' : ''} />
      {objectionIds.map((id) => (
        <input key={id} type="hidden" name="objectionIds" value={id} />
      ))}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${ids}-producto`}>
          Producto <span className="font-normal text-text-muted">(obligatorio)</span>
        </Label>
        <select
          id={`${ids}-producto`}
          name="productId"
          value={productId}
          disabled={pending}
          aria-invalid={errors?.productId ? true : undefined}
          onChange={(event) => {
            setProductId(event.target.value);
            setObjectionIds([]);
          }}
          className={cn(fieldControlClass, 'min-h-touch py-2 sm:max-w-md')}
        >
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} · {SECTOR_LABELS[p.sector]}
            </option>
          ))}
        </select>
      </div>

      <fieldset className="flex flex-col gap-3" disabled={pending}>
        <legend className="mb-1 font-semibold">
          Objeciones a practicar{' '}
          <span className="font-normal text-text-muted">(de 1 a {MAX_OBJECTIONS})</span>
        </legend>
        {product && product.objections.length === 0 ? (
          <FormAlert tone="info">
            <span>Este producto aún no tiene objeciones. </span>
            <Link
              href={`/productos/${product.id}?pestana=objeciones`}
              className="inline-flex items-center gap-1 font-semibold text-primary underline underline-offset-4"
            >
              <PlusCircle className="size-4" aria-hidden="true" />
              Agregar objeciones a {product.name}
            </Link>
          </FormAlert>
        ) : (
          <>
            <p
              className="text-sm text-text-muted"
              aria-live="polite"
              id={`${ids}-objeciones-ayuda`}
            >
              Elegiste {objectionIds.length} de {MAX_OBJECTIONS}. Una será la que el cliente plantee
              al inicio; las demás quedarán ocultas.
            </p>
            <ul className="flex flex-col gap-2">
              {product?.objections.map((o) => {
                const checked = objectionIds.includes(o.id);
                const id = `${ids}-obj-${o.id}`;
                return (
                  <li
                    key={o.id}
                    className="flex items-start gap-3 rounded-md border border-border p-3"
                  >
                    <Checkbox
                      id={id}
                      checked={checked}
                      disabled={!checked && atLimit}
                      aria-describedby={`${ids}-objeciones-ayuda`}
                      onCheckedChange={(value) => toggleObjection(o.id, value === true)}
                    />
                    <Label htmlFor={id} className="flex flex-col gap-0.5 font-normal">
                      <span>{o.text}</span>
                      {o.category ? (
                        <span className="text-sm text-text-muted">
                          {OBJECTION_CATEGORY_LABELS[o.category]}
                        </span>
                      ) : null}
                    </Label>
                  </li>
                );
              })}
            </ul>
            {errors?.objectionIds ? (
              <p className="text-sm font-medium text-danger" role="alert">
                {errors.objectionIds[0]}
              </p>
            ) : null}
          </>
        )}
      </fieldset>

      <fieldset className="flex flex-col gap-3" disabled={pending}>
        <legend className="mb-1 font-semibold">Dificultad</legend>
        <RadioGroup
          name="difficulty"
          value={difficulty}
          onValueChange={setDifficulty}
          aria-describedby={`${ids}-dificultad-descripcion`}
          className="grid-cols-1 gap-2 sm:grid-cols-5"
        >
          {DIFFICULTIES.map((d) => (
            <div
              key={d.level}
              className="flex items-center gap-3 rounded-md border border-border p-3 sm:flex-col sm:items-start"
            >
              <RadioGroupItem id={`${ids}-dif-${d.level}`} value={String(d.level)} />
              <Label htmlFor={`${ids}-dif-${d.level}`} className="font-normal">
                {d.level} · {d.name}
              </Label>
            </div>
          ))}
        </RadioGroup>
        <p
          id={`${ids}-dificultad-descripcion`}
          aria-live="polite"
          className="rounded-md bg-surface-sunken p-3 text-sm"
        >
          {selectedDifficulty
            ? `${selectedDifficulty.name}: ${selectedDifficulty.description}`
            : 'Elige una dificultad.'}
        </p>
      </fieldset>

      <div className="flex items-start justify-between gap-4 rounded-md border border-border p-3">
        <div className="flex flex-col gap-0.5">
          <Label htmlFor={`${ids}-pistas`}>Pistas durante la práctica</Label>
          <p className="text-sm text-text-muted" id={`${ids}-pistas-descripcion`}>
            Podrás pedir una pista por turno. Desactívalas si quieres practicar sin ayuda.
          </p>
        </div>
        <Switch
          id={`${ids}-pistas`}
          checked={hintsEnabled}
          disabled={pending}
          onCheckedChange={setHintsEnabled}
          aria-describedby={`${ids}-pistas-descripcion`}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${ids}-foco`}>
          Etapa foco C.A.U.T.I.V.A.™ <span className="font-normal text-text-muted">(opcional)</span>
        </Label>
        <select
          id={`${ids}-foco`}
          name="focusStage"
          value={focusStage}
          disabled={pending}
          onChange={(event) => setFocusStage(event.target.value)}
          className={cn(fieldControlClass, 'min-h-touch py-2 sm:max-w-xs')}
        >
          <option value="">Sin etapa foco</option>
          {CAUTIVA_STAGES.map((stage) => (
            <option key={stage} value={stage}>
              {cautivaLabel(stage)}
            </option>
          ))}
        </select>
      </div>

      {pending ? (
        <p role="status" className="flex items-center gap-2 font-medium">
          <Loader2 className="size-5 animate-spin text-accent-strong" aria-hidden="true" />
          Preparando a tu comprador…
        </p>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button type="submit" disabled={!canSubmit} aria-disabled={!canSubmit || undefined}>
          {failure?.code === 'ai_unavailable' ? 'Reintentar' : 'Preparar mi comprador'}
        </Button>
      </div>
    </form>
  );
}
