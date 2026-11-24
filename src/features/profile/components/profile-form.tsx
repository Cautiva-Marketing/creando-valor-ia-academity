'use client';

import { useActionState, useState } from 'react';
import { Button } from '@/components/ui/button';
import { FormAlert } from '@/components/ui/form-alert';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/sonner';
import type { ActionResult } from '@/lib/action-result';
import { updateProfile } from '../actions';
import { DEFAULT_TIMEZONE, TimezoneCombobox } from './timezone-combobox';

/** Name + time zone (FR-035). Controlled fields so a failed submit keeps what was typed. */
export function ProfileForm({ fullName, timezone }: { fullName: string; timezone: string }) {
  const [name, setName] = useState(fullName);
  const [zone, setZone] = useState(timezone || DEFAULT_TIMEZONE);
  const [state, action, pending] = useActionState(
    async (prev: ActionResult | null, formData: FormData) => {
      const result = await updateProfile(prev, formData);
      if (result.ok) toast.success('Guardamos tu perfil.');
      return result;
    },
    null,
  );
  const failure = state && !state.ok ? state : null;

  return (
    <form action={action} noValidate className="flex flex-col gap-4">
      {failure && !failure.fieldErrors ? <FormAlert>{failure.message}</FormAlert> : null}
      <FormField id="fullName" label="Nombre" errors={failure?.fieldErrors?.fullName} required>
        {(control) => (
          <Input
            {...control}
            name="fullName"
            autoComplete="name"
            maxLength={120}
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="sm:max-w-sm"
          />
        )}
      </FormField>
      <FormField
        id="timezone"
        label="Zona horaria"
        description="Tus fechas y horas se muestran en esta zona."
        errors={failure?.fieldErrors?.timezone}
        required
      >
        {(control) => (
          <TimezoneCombobox {...control} name="timezone" value={zone} onValueChange={setZone} />
        )}
      </FormField>
      <div>
        <Button type="submit" loading={pending} loadingLabel="Guardando…">
          Guardar cambios
        </Button>
      </div>
    </form>
  );
}
