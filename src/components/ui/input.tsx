import * as React from 'react';
import { cn } from '@/lib/utils';

export const fieldControlClass = cn(
  'w-full min-w-0 rounded-md border border-border-strong bg-surface-raised px-3 text-base text-text',
  'placeholder:text-text-muted',
  'transition-colors duration-150',
  'focus-visible:outline-3 focus-visible:outline-offset-1 focus-visible:outline-focus-ring',
  'disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:opacity-70',
  'read-only:bg-surface-sunken',
  'aria-invalid:border-danger aria-invalid:border-2',
);

export function Input({ className, type = 'text', ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(fieldControlClass, 'min-h-touch py-2', className)}
      {...props}
    />
  );
}
