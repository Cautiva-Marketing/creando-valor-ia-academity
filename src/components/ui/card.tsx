import * as React from 'react';
import { cn } from '@/lib/utils';

export function Card({ className, ...props }: React.ComponentProps<'section'>) {
  return (
    <section
      data-slot="card"
      className={cn(
        'flex flex-col gap-4 rounded-lg border border-border bg-surface-raised p-5 text-text shadow-sm sm:p-6',
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div data-slot="card-header" className={cn('flex flex-col gap-1', className)} {...props} />
  );
}

export function CardTitle({
  className,
  as: Heading = 'h2',
  ...props
}: React.ComponentProps<'h2'> & { as?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' }) {
  return <Heading data-slot="card-title" className={cn('text-xl', className)} {...props} />;
}

export function CardDescription({ className, ...props }: React.ComponentProps<'p'>) {
  return <p data-slot="card-description" className={cn('text-text-muted', className)} {...props} />;
}

export function CardContent({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div data-slot="card-content" className={cn('flex flex-col gap-4', className)} {...props} />
  );
}

export function CardFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-footer"
      className={cn('flex flex-wrap items-center gap-3', className)}
      {...props}
    />
  );
}
