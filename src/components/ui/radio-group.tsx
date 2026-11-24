'use client';

import { RadioGroup as RadioGroupPrimitive } from 'radix-ui';
import * as React from 'react';
import { cn } from '@/lib/utils';

export function RadioGroup({
  className,
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Root>) {
  return (
    <RadioGroupPrimitive.Root
      data-slot="radio-group"
      className={cn('grid gap-3', className)}
      {...props}
    />
  );
}

export function RadioGroupItem({
  className,
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Item>) {
  return (
    <RadioGroupPrimitive.Item
      data-slot="radio-group-item"
      className={cn(
        'peer hit-area-y inline-flex size-6 min-h-0 shrink-0 items-center justify-center rounded-full border-2 border-border-strong bg-surface-raised',
        'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus-ring',
        'disabled:cursor-not-allowed disabled:opacity-60 data-[state=checked]:border-primary aria-invalid:border-danger',
        className,
      )}
      {...props}
    >
      <RadioGroupPrimitive.Indicator className="size-3 rounded-full bg-primary" />
    </RadioGroupPrimitive.Item>
  );
}
