import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { Slot } from 'radix-ui';
import * as React from 'react';
import { cn } from '@/lib/utils';

export const buttonVariants = cva(
  [
    'inline-flex shrink-0 items-center justify-center gap-2 rounded-md font-semibold whitespace-nowrap select-none',
    'transition-colors duration-150 ease-standard',
    'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus-ring',
    'disabled:pointer-events-none disabled:opacity-60 aria-disabled:pointer-events-none aria-disabled:opacity-60',
    '[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  ],
  {
    variants: {
      variant: {
        primary: 'bg-primary text-on-primary hover:opacity-90',
        secondary:
          'border border-border-strong bg-surface-raised text-text hover:bg-surface-sunken',
        accent: 'bg-accent text-on-accent hover:opacity-90',
        ghost: 'bg-transparent text-text hover:bg-surface-sunken',
        destructive: 'bg-danger text-on-danger hover:opacity-90',
        link: 'h-auto min-h-touch px-1 text-primary underline underline-offset-4 hover:opacity-80',
      },
      size: {
        sm: 'min-h-touch px-3 text-sm',
        md: 'min-h-touch px-4 text-base',
        lg: 'min-h-12 px-6 text-lg',
        icon: 'size-touch p-0',
      },
    },
    compoundVariants: [{ variant: 'link', size: ['sm', 'md', 'lg'], className: 'px-1' }],
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps
  extends React.ComponentProps<'button'>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  /** Shows a spinner, sets aria-busy and disables the button. */
  loading?: boolean;
  loadingLabel?: string;
}

export function Button({
  className,
  variant,
  size,
  asChild = false,
  loading = false,
  loadingLabel,
  disabled,
  children,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot.Root : 'button';
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={asChild ? undefined : disabled || loading}
      aria-busy={loading || undefined}
      aria-disabled={asChild && (disabled || loading) ? true : undefined}
      {...props}
    >
      {asChild ? (
        children
      ) : (
        <>
          {loading ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
          {loading && loadingLabel ? loadingLabel : children}
        </>
      )}
    </Comp>
  );
}
