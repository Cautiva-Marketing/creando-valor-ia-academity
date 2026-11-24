'use client';

import { Progress as ProgressPrimitive } from 'radix-ui';
import * as React from 'react';
import { cn } from '@/lib/utils';

/** Progress bar (role="progressbar" with aria-valuenow). Needs an accessible name (aria-label). */
export function Progress({
  value,
  max = 100,
  className,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root> & { value: number }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      value={value}
      max={max}
      className={cn(
        'relative h-3 w-full overflow-hidden rounded-full bg-surface-sunken',
        className,
      )}
      {...props}
    >
      <ProgressPrimitive.Indicator
        className="progress-fill h-full bg-primary transition-transform duration-(--duration-slow) ease-standard"
        style={{ '--progress': pct } as React.CSSProperties}
      />
    </ProgressPrimitive.Root>
  );
}
