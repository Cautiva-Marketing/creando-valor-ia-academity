'use client';

import { useMemo } from 'react';
import { Combobox, type ComboboxOption } from '@/components/ui/combobox';

export const DEFAULT_TIMEZONE = 'America/Lima';

function supportedTimeZones(): string[] {
  try {
    return Intl.supportedValuesOf('timeZone');
  } catch {
    return [DEFAULT_TIMEZONE, 'UTC'];
  }
}

/** Time zones from Intl, always including the current value even if Intl does not list it. */
export function timeZoneOptions(current: string): ComboboxOption[] {
  const zones = new Set(supportedTimeZones());
  if (current) zones.add(current);
  return [...zones].sort().map((zone) => ({
    value: zone,
    label: zone.replaceAll('_', ' '),
    keywords: zone.split('/').map((part) => part.replaceAll('_', ' ')),
  }));
}

export function TimezoneCombobox({
  value,
  onValueChange,
  ...props
}: {
  id: string;
  name: string;
  value: string;
  onValueChange: (value: string) => void;
  'aria-describedby'?: string;
  'aria-invalid'?: true;
  'aria-required'?: true;
}) {
  const options = useMemo(() => timeZoneOptions(value), [value]);
  return (
    <Combobox
      {...props}
      options={options}
      value={value}
      onValueChange={onValueChange}
      placeholder="Elige tu zona horaria"
      searchPlaceholder="Buscar zona o ciudad"
      emptyText="No encontramos esa zona horaria."
      className="sm:max-w-sm"
    />
  );
}
