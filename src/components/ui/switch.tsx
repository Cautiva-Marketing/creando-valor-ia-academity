'use client';

import { Switch as SwitchPrimitive } from 'radix-ui';
import * as React from 'react';
import { cn } from '@/lib/utils';

/** 44 px tall hit area around a 28 px track. */
export function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        'peer hit-area-y inline-flex h-7 min-h-0 w-12 shrink-0 items-center rounded-full border-2 border-border-strong bg-surface-sunken',
        'transition-colors duration-(--duration-fast) ease-standard',
        'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus-ring',
        'disabled:cursor-not-allowed disabled:opacity-60',
        'data-[state=checked]:border-primary data-[state=checked]:bg-primary',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          'pointer-events-none block size-5 translate-x-0.5 rounded-full bg-text-muted shadow-sm',
          'transition-transform duration-(--duration-fast) ease-standard',
          'data-[state=checked]:translate-x-5 data-[state=checked]:bg-on-primary',
        )}
      />
    </SwitchPrimitive.Root>
  );
}
