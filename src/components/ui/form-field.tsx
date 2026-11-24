'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { Label } from './label';

interface FieldControlProps {
  id: string;
  'aria-describedby'?: string;
  'aria-invalid'?: true;
  'aria-required'?: true;
}

interface FormFieldProps {
  id: string;
  label: React.ReactNode;
  description?: React.ReactNode;
  /** Error messages; the first one is shown. */
  errors?: string[] | string;
  required?: boolean;
  className?: string;
  /** Render prop receiving the accessibility props for the control. */
  children: (control: FieldControlProps) => React.ReactNode;
}

/** Label + description + error with aria-describedby / aria-invalid wiring (WCAG 2.2 AA). */
export function FormField({
  id,
  label,
  description,
  errors,
  required,
  className,
  children,
}: FormFieldProps) {
  const error = Array.isArray(errors) ? errors[0] : errors;
  const descriptionId = description ? `${id}-descripcion` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [descriptionId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div data-slot="form-field" className={cn('flex flex-col gap-1.5', className)}>
      <Label htmlFor={id}>
        {label}
        {required ? <span className="text-text-muted font-normal"> (obligatorio)</span> : null}
      </Label>
      {description ? (
        <p id={descriptionId} className="text-sm text-text-muted">
          {description}
        </p>
      ) : null}
      {children({
        id,
        'aria-describedby': describedBy,
        'aria-invalid': error ? true : undefined,
        'aria-required': required ? true : undefined,
      })}
      {error ? (
        <p id={errorId} className="text-sm font-medium text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
