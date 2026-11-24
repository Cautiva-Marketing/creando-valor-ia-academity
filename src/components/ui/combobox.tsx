'use client';

import { Command as CommandPrimitive } from 'cmdk';
import { Check, ChevronsUpDown } from 'lucide-react';
import { Popover as PopoverPrimitive } from 'radix-ui';
import * as React from 'react';
import { cn } from '@/lib/utils';
import { fieldControlClass } from './input';

export interface ComboboxOption {
  value: string;
  label: string;
  /** Extra text matched by the search (e.g. city names). */
  keywords?: string[];
}

interface ComboboxProps {
  id?: string;
  /** Name of the hidden input that carries the value in a form. */
  name?: string;
  options: ComboboxOption[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  className?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: true;
  'aria-required'?: true;
}

/**
 * Searchable single select (cmdk + Radix Popover). The trigger is a button with role="combobox";
 * arrows/Enter/Escape work inside the list and focus returns to the trigger on close.
 */
export function Combobox({
  id,
  name,
  options,
  value,
  onValueChange,
  placeholder = 'Elige una opción',
  searchPlaceholder = 'Buscar…',
  emptyText = 'Sin resultados.',
  disabled,
  className,
  ...aria
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const listId = React.useId();
  const selected = options.find((option) => option.value === value);

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild>
        <button
          id={id}
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-haspopup="listbox"
          disabled={disabled}
          className={cn(
            fieldControlClass,
            'flex min-h-touch items-center justify-between gap-2 py-2 text-left',
            !selected && 'text-text-muted',
            className,
          )}
          {...aria}
        >
          <span className="truncate">{selected?.label ?? placeholder}</span>
          <ChevronsUpDown className="size-4 shrink-0 text-text-muted" aria-hidden="true" />
        </button>
      </PopoverPrimitive.Trigger>
      {name ? <input type="hidden" name={name} value={value} /> : null}
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={4}
          className="z-50 w-(--radix-popover-trigger-width) min-w-64 overflow-hidden rounded-md border border-border bg-surface-raised text-text shadow-md"
        >
          <CommandPrimitive className="flex flex-col" loop>
            <CommandPrimitive.Input
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              className="min-h-touch border-b border-border bg-transparent px-3 text-base outline-none placeholder:text-text-muted"
            />
            <CommandPrimitive.List id={listId} className="max-h-72 overflow-y-auto p-1">
              <CommandPrimitive.Empty className="px-3 py-4 text-sm text-text-muted">
                {emptyText}
              </CommandPrimitive.Empty>
              {options.map((option) => (
                <CommandPrimitive.Item
                  key={option.value}
                  value={option.value}
                  keywords={[option.label, ...(option.keywords ?? [])]}
                  onSelect={() => {
                    onValueChange(option.value);
                    setOpen(false);
                  }}
                  className="relative flex min-h-touch cursor-default items-center rounded-sm py-2 pr-8 pl-3 text-base outline-none select-none data-[selected=true]:bg-surface-sunken"
                >
                  <span className="truncate">{option.label}</span>
                  {option.value === value ? (
                    <Check className="absolute right-2 size-4" aria-hidden="true" />
                  ) : null}
                </CommandPrimitive.Item>
              ))}
            </CommandPrimitive.List>
          </CommandPrimitive>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
