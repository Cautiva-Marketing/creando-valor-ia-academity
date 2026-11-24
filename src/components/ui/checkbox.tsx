'use client';

import { Check } from 'lucide-react';
import { Checkbox as CheckboxPrimitive } from 'radix-ui';
import * as React from 'react';
import { cn } from '@/lib/utils';

export function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        'peer hit-area-y size-6 min-h-0 shrink-0 rounded-sm border-2 border-border-strong bg-surface-raised',
        'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus-ring',
        'disabled:cursor-not-allowed disabled:opacity-60',
        'data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-on-primary',
        'aria-invalid:border-danger',
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator className="flex items-center justify-center">
        <Check className="size-4" strokeWidth={3} aria-hidden="true" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}
