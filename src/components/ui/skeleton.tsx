import * as React from 'react';
import { cn } from '@/lib/utils';

/** Loading placeholder; decorative (the region announces loading with aria-busy). */
export function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn(
        'animate-pulse rounded-md bg-surface-sunken motion-reduce:animate-none',
        className,
      )}
      {...props}
    />
  );
}
