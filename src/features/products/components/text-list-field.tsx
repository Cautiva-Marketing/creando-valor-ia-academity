'use client';

import { Plus, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/**
 * Accessible dynamic list (T049): one input per element under a fieldset, "Agregar" / "Quitar"
 * buttons, focus moved to the new or next element, and changes announced in a polite live region.
 * Every input is submitted with the same `name` (FormData.getAll).
 */
export function TextListField({
  name,
  legend,
  itemLabel,
  description,
  items,
  onChange,
  max,
  maxLength,
  errors,
  required = false,
}: {
  name: string;
  legend: string;
  /** Singular, lower case: "beneficio". */
  itemLabel: string;
  description?: string;
  items: string[];
  onChange: (items: string[]) => void;
  max: number;
  maxLength: number;
  errors?: string[];
  required?: boolean;
}) {
  const [announcement, setAnnouncement] = useState('');
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const addButton = useRef<HTMLButtonElement>(null);
  const error = errors?.[0];
  const errorId = error ? `${name}-error` : undefined;
  const descriptionId = description ? `${name}-descripcion` : undefined;
  const capitalized = itemLabel.charAt(0).toUpperCase() + itemLabel.slice(1);

  function focusLater(index: number | 'add') {
    requestAnimationFrame(() => {
      if (index === 'add') addButton.current?.focus();
      else inputs.current[index]?.focus();
    });
  }

  function add() {
    if (items.length >= max) return;
    onChange([...items, '']);
    setAnnouncement(`${capitalized} ${items.length + 1} agregado. ${items.length + 1} de ${max}.`);
    focusLater(items.length);
  }

  function remove(index: number) {
    const next = items.filter((_, i) => i !== index);
    onChange(next);
    setAnnouncement(`${capitalized} ${index + 1} quitado. ${next.length} de ${max}.`);
    focusLater(next.length === 0 ? 'add' : Math.min(index, next.length - 1));
  }

  return (
    <fieldset
      className="flex flex-col gap-2"
      aria-describedby={[descriptionId, errorId].filter(Boolean).join(' ') || undefined}
    >
      <legend className="mb-1.5 text-base font-medium">
        {legend}
        {required ? <span className="font-normal text-text-muted"> (obligatorio)</span> : null}
      </legend>
      {description ? (
        <p id={descriptionId} className="text-sm text-text-muted">
          {description}
        </p>
      ) : null}
      {items.length > 0 ? (
        <ol className="flex flex-col gap-2">
          {items.map((item, index) => (
            // Positional keys keep focus stable while typing; rows only change through add/remove.
            <li key={index} className="flex items-center gap-2">
              <Input
                ref={(element) => {
                  inputs.current[index] = element;
                }}
                name={name}
                value={item}
                maxLength={maxLength}
                aria-label={`${capitalized} ${index + 1}`}
                aria-invalid={error ? true : undefined}
                onChange={(event) =>
                  onChange(items.map((value, i) => (i === index ? event.target.value : value)))
                }
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    if (index === items.length - 1 && items.length < max) add();
                    else inputs.current[index + 1]?.focus();
                  }
                }}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => remove(index)}
                aria-label={`Quitar ${itemLabel} ${index + 1}`}
              >
                <X aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ol>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          ref={addButton}
          type="button"
          variant="secondary"
          size="sm"
          onClick={add}
          disabled={items.length >= max}
        >
          <Plus aria-hidden="true" />
          Agregar {itemLabel}
        </Button>
        <span className="text-sm text-text-muted">
          {items.length} de {max}
        </span>
      </div>
      {error ? (
        <p id={errorId} className="text-sm font-medium text-danger" role="alert">
          {error}
        </p>
      ) : null}
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
    </fieldset>
  );
}
