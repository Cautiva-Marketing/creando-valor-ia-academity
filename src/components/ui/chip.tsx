import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Chip (002): compact button for "ideas para probar" (FR-031) and selectable options such as
 * objections or the focus stage. Touch target ≥ 44 px, visible focus, tokens only. When `selected`
 * is given it behaves as a toggle (`aria-pressed`).
 */
export const chipVariants = cva(
  [
    'inline-flex min-h-touch max-w-full items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium',
    'text-left transition-colors duration-150 ease-standard select-none',
    'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus-ring',
    'disabled:pointer-events-none disabled:opacity-60',
    '[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  ],
  {
    variants: {
      variant: {
        outline: 'border-border-strong bg-surface-raised text-text hover:bg-surface-sunken',
        soft: 'border-transparent bg-surface-sunken text-text hover:bg-surface',
      },
      selected: {
        true: 'border-primary bg-primary text-on-primary hover:bg-primary hover:opacity-90',
        false: '',
      },
    },
    defaultVariants: { variant: 'outline', selected: false },
  },
);

export interface ChipProps
  extends Omit<React.ComponentProps<'button'>, 'type'>, VariantProps<typeof chipVariants> {
  /** Toggle state; omit for a plain action chip. */
  selected?: boolean;
}

export function Chip({ className, variant, selected, children, ...props }: ChipProps) {
  return (
    <button
      type="button"
      data-slot="chip"
      aria-pressed={selected === undefined ? undefined : selected}
      className={cn(chipVariants({ variant, selected: selected ?? false }), className)}
      {...props}
    >
      <span className="min-w-0">{children}</span>
    </button>
  );
}
