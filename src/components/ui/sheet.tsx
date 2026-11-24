'use client';

import { X } from 'lucide-react';
import { Dialog as SheetPrimitive } from 'radix-ui';
import * as React from 'react';
import { cn } from '@/lib/utils';

/** Side sheet (Radix Dialog): focus trap, Escape and focus return included. */
export const Sheet = SheetPrimitive.Root;
export const SheetTrigger = SheetPrimitive.Trigger;
export const SheetClose = SheetPrimitive.Close;

const sides = {
  right: 'inset-y-0 right-0 h-full w-full max-w-sm border-l',
  left: 'inset-y-0 left-0 h-full w-full max-w-sm border-r',
} as const;

export function SheetContent({
  className,
  children,
  side = 'right',
  closeLabel = 'Cerrar',
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & {
  side?: keyof typeof sides;
  closeLabel?: string;
}) {
  return (
    <SheetPrimitive.Portal>
      <SheetPrimitive.Overlay className="fixed inset-0 z-50 bg-scrim" />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        className={cn(
          'fixed z-50 flex flex-col gap-4 overflow-y-auto border-border bg-surface-raised p-6 text-text shadow-lg',
          sides[side],
          className,
        )}
        {...props}
      >
        {children}
        <SheetPrimitive.Close
          className="absolute top-2 right-2 inline-flex size-touch items-center justify-center rounded-md text-text-muted hover:bg-surface-sunken"
          aria-label={closeLabel}
        >
          <X className="size-5" aria-hidden="true" />
        </SheetPrimitive.Close>
      </SheetPrimitive.Content>
    </SheetPrimitive.Portal>
  );
}

export function SheetHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('flex flex-col gap-2 pr-10', className)} {...props} />;
}

export function SheetTitle({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title
      className={cn('font-display text-xl font-semibold', className)}
      {...props}
    />
  );
}

export function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return <SheetPrimitive.Description className={cn('text-text-muted', className)} {...props} />;
}
