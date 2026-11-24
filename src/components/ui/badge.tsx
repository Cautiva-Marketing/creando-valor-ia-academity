import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { cn } from '@/lib/utils';

export const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap [&_svg]:size-3.5',
  {
    variants: {
      variant: {
        neutral: 'border border-border-strong bg-surface-sunken text-text',
        primary: 'bg-primary text-on-primary',
        accent: 'bg-accent text-on-accent',
        success: 'bg-success text-on-success',
        warning: 'bg-warning text-on-warning',
        danger: 'bg-danger text-on-danger',
        info: 'bg-info text-on-info',
      },
    },
    defaultVariants: { variant: 'neutral' },
  },
);

export function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return (
    <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}
