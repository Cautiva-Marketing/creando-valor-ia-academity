'use client';

import { ShieldAlert } from 'lucide-react';
import { startTransition, useActionState, useState } from 'react';
import { Button } from '@/components/ui/button';
import { FormAlert } from '@/components/ui/form-alert';
import { FormField } from '@/components/ui/form-field';
import { Input, fieldControlClass } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { toast } from '@/components/ui/sonner';
import { Textarea } from '@/components/ui/textarea';
import type { ActionResult } from '@/lib/action-result';
import { cn } from '@/lib/utils';
import { SECTOR_LABELS } from '@/features/practice/domain/labels';
import { createProduct, updateProduct } from '../actions';
import type { ProductVersionContent } from '../queries';
import { PRODUCT_LIMITS, PRODUCT_SECTORS } from '../schemas';
import { TextListField } from './text-list-field';

/** Price typed by the seller, shown in the es-PE style they will read back (`1 250,50`). */
function priceText(value: number | undefined): string {
  if (value === undefined) return '';
  const [integer, decimals] = value.toFixed(2).split('.') as [string, string];
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return decimals === '00' ? grouped : `${grouped},${decimals}`;
}

/** FR-005: always visible above the fields. */
export function FictitiousDataNotice() {
  return (
    <aside
      aria-label="Aviso sobre los datos"
      className="flex gap-3 rounded-md border border-border bg-highlight p-3 text-sm text-on-highlight"
    >
      <ShieldAlert className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
      <p>
        <strong className="font-semibold">Usa datos ficticios o autorizados;</strong> no ingreses
        datos personales de clientes reales.
      </p>
    </aside>
  );
}

type Mode =
  | { kind: 'create' }
  | { kind: 'edit'; productId: string; expectedVersion: number; initial: ProductVersionContent };

type FormResult = ActionResult<{ version: number; unchanged: boolean } | undefined>;

/**
 * Product form (T049, FR-001/FR-005): every field is controlled, so a failed submit keeps what was
 * typed. Create uses one idempotency key per form (double submit → same product).
 */
export function ProductForm({ mode }: { mode: Mode }) {
  const initial = mode.kind === 'edit' ? mode.initial : undefined;
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [sector, setSector] = useState<string>(initial?.sector ?? '');
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [priceKind, setPriceKind] = useState<'fixed' | 'range'>(initial?.priceKind ?? 'fixed');
  const [priceMin, setPriceMin] = useState(priceText(initial?.priceMin));
  const [priceMax, setPriceMax] = useState(
    initial?.priceKind === 'range' ? priceText(initial.priceMax) : '',
  );
  const [benefits, setBenefits] = useState<string[]>(initial?.benefits ?? ['']);
  const [differentiators, setDifferentiators] = useState<string[]>(initial?.differentiators ?? []);
  const [verifiableFacts, setVerifiableFacts] = useState<string[]>(initial?.verifiableFacts ?? []);

  const [state, action, pending] = useActionState(
    async (prev: FormResult | null, formData: FormData): Promise<FormResult> => {
      if (mode.kind === 'create') return createProduct(prev as ActionResult | null, formData);
      const result = await updateProduct(null, formData);
      if (result.ok) {
        toast.success(
          result.data.unchanged
            ? `No hubo cambios; sigue vigente la versión ${result.data.version}.`
            : `Guardamos la versión ${result.data.version}.`,
        );
      }
      return result;
    },
    null,
  );
  const failure = state && !state.ok ? state : null;
  const errors = failure?.fieldErrors;
  const descriptionCounterId = 'description-contador';

  return (
    <form
      noValidate
      className="flex flex-col gap-6"
      // onSubmit instead of `action`: React resets forms after an action and the Radix radio group
      // would fall back to "Precio fijo", losing what was typed.
      onSubmit={(event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        startTransition(() => action(formData));
      }}
    >
      <FictitiousDataNotice />
      {failure ? <FormAlert>{failure.message}</FormAlert> : null}

      {mode.kind === 'create' ? (
        <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      ) : (
        <>
          <input type="hidden" name="productId" value={mode.productId} />
          <input type="hidden" name="expectedVersion" value={mode.expectedVersion} />
        </>
      )}

      <FormField id="sector" label="Rubro" errors={errors?.sector} required>
        {(control) => (
          <select
            {...control}
            name="sector"
            value={sector}
            onChange={(event) => setSector(event.target.value)}
            className={cn(fieldControlClass, 'min-h-touch py-2 sm:max-w-sm')}
          >
            <option value="" disabled>
              Elige un rubro
            </option>
            {PRODUCT_SECTORS.map((value) => (
              <option key={value} value={value}>
                {SECTOR_LABELS[value]}
              </option>
            ))}
          </select>
        )}
      </FormField>

      <FormField id="name" label="Nombre del producto o servicio" errors={errors?.name} required>
        {(control) => (
          <Input
            {...control}
            name="name"
            value={name}
            maxLength={PRODUCT_LIMITS.nameMax}
            autoComplete="off"
            onChange={(event) => setName(event.target.value)}
          />
        )}
      </FormField>

      <div className="flex flex-col gap-1">
        <FormField
          id="description"
          label="Descripción"
          description="Qué es, para quién y cómo se entrega."
          errors={errors?.description}
        >
          {(control) => (
            <Textarea
              {...control}
              aria-describedby={[control['aria-describedby'], descriptionCounterId]
                .filter(Boolean)
                .join(' ')}
              name="description"
              value={description}
              maxLength={PRODUCT_LIMITS.descriptionMax}
              onChange={(event) => setDescription(event.target.value)}
            />
          )}
        </FormField>
        <p
          id={descriptionCounterId}
          className={cn(
            'text-sm',
            description.length >= PRODUCT_LIMITS.descriptionMax ? 'text-danger' : 'text-text-muted',
          )}
        >
          {description.length} de 1.000 caracteres
        </p>
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1.5 text-base font-medium">
          Precio en soles (S/)
          <span className="font-normal text-text-muted"> (obligatorio)</span>
        </legend>
        <RadioGroup
          name="priceKind"
          value={priceKind}
          onValueChange={(value) => setPriceKind(value as 'fixed' | 'range')}
          className="flex flex-wrap gap-6"
          aria-label="Tipo de precio"
        >
          {(
            [
              ['fixed', 'Precio fijo'],
              ['range', 'Rango (mínimo y máximo)'],
            ] as const
          ).map(([value, label]) => (
            <div key={value} className="flex items-center gap-2">
              <RadioGroupItem id={`priceKind-${value}`} value={value} />
              <Label htmlFor={`priceKind-${value}`} className="font-normal">
                {label}
              </Label>
            </div>
          ))}
        </RadioGroup>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            id="priceMin"
            label={priceKind === 'fixed' ? 'Precio' : 'Precio mínimo'}
            description="Ejemplo: 1 250,50"
            errors={errors?.priceMin}
            required
          >
            {(control) => (
              <Input
                {...control}
                name="priceMin"
                inputMode="decimal"
                autoComplete="off"
                value={priceMin}
                onChange={(event) => setPriceMin(event.target.value)}
              />
            )}
          </FormField>
          {priceKind === 'range' ? (
            <FormField
              id="priceMax"
              label="Precio máximo"
              description="Mayor o igual al mínimo"
              errors={errors?.priceMax}
              required
            >
              {(control) => (
                <Input
                  {...control}
                  name="priceMax"
                  inputMode="decimal"
                  autoComplete="off"
                  value={priceMax}
                  onChange={(event) => setPriceMax(event.target.value)}
                />
              )}
            </FormField>
          ) : null}
        </div>
      </fieldset>

      <TextListField
        name="benefits"
        legend="Beneficios"
        itemLabel="beneficio"
        description="Lo que gana tu cliente. Entre 1 y 10."
        items={benefits}
        onChange={setBenefits}
        max={PRODUCT_LIMITS.listMax}
        maxLength={PRODUCT_LIMITS.itemMax}
        errors={errors?.benefits}
        required
      />
      <TextListField
        name="differentiators"
        legend="Diferenciadores"
        itemLabel="diferenciador"
        description="Por qué elegirte frente a la competencia. Opcional, hasta 10."
        items={differentiators}
        onChange={setDifferentiators}
        max={PRODUCT_LIMITS.listMax}
        maxLength={PRODUCT_LIMITS.itemMax}
        errors={errors?.differentiators}
      />
      <TextListField
        name="verifiableFacts"
        legend="Datos verificables"
        itemLabel="dato verificable"
        description='Hechos que el cliente puede comprobar, por ejemplo "Partida registral inscrita en Sunarp". Opcional, hasta 10.'
        items={verifiableFacts}
        onChange={setVerifiableFacts}
        max={PRODUCT_LIMITS.listMax}
        maxLength={PRODUCT_LIMITS.itemMax}
        errors={errors?.verifiableFacts}
      />

      <div>
        <Button type="submit" loading={pending} loadingLabel="Guardando…">
          {mode.kind === 'create' ? 'Guardar producto' : 'Guardar cambios'}
        </Button>
      </div>
    </form>
  );
}
