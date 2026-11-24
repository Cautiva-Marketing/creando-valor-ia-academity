'use client';

import { X } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import * as React from 'react';
import { cn } from '@/lib/utils';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;
export const DialogPortal = DialogPrimitive.Portal;

export function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn('fixed inset-0 z-50 bg-scrim', className)}
      {...props}
    />
  );
}

export function DialogContent({
  className,
  children,
  closeLabel = 'Cerrar',
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & { closeLabel?: string }) {
  return (
    <DialogPortal>
      <DialogOverlay className="grid place-items-center overflow-y-auto p-4">
        <DialogPrimitive.Content
          data-slot="dialog-content"
          className={cn(
            'relative z-50 grid w-full max-w-lg gap-4',
            'rounded-lg border border-border bg-surface-raised p-6 text-text shadow-lg',
            className,
          )}
          {...props}
        >
          {children}
          <DialogPrimitive.Close
            className="absolute top-2 right-2 inline-flex size-touch items-center justify-center rounded-md text-text-muted hover:bg-surface-sunken"
            aria-label={closeLabel}
          >
            <X className="size-5" aria-hidden="true" />
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogOverlay>
    </DialogPortal>
  );
}

export function DialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('flex flex-col gap-2 pr-10', className)} {...props} />;
}

export function DialogFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)}
      {...props}
    />
  );
}

export function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title className={cn('text-xl font-display', className)} {...props} />;
}

export function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description className={cn('text-text-muted', className)} {...props} />;
}
