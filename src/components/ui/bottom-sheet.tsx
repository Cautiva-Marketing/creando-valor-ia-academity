'use client';

import * as React from 'react';
import { Drawer } from 'vaul';
import { cn } from '@/lib/utils';

/** Mobile bottom sheet (vaul): drag to close, Escape and focus return. */
export const BottomSheet = Drawer.Root;
export const BottomSheetTrigger = Drawer.Trigger;
export const BottomSheetClose = Drawer.Close;
export const BottomSheetTitle = Drawer.Title;
export const BottomSheetDescription = Drawer.Description;

export function BottomSheetContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof Drawer.Content>) {
  return (
    <Drawer.Portal>
      <Drawer.Overlay className="fixed inset-0 z-50 bg-scrim" />
      <Drawer.Content
        data-slot="bottom-sheet-content"
        className={cn(
          'fixed inset-x-0 bottom-0 z-50 flex max-h-sheet flex-col gap-4 rounded-t-xl border-t border-border bg-surface-raised p-6 pb-safe text-text shadow-lg',
          className,
        )}
        {...props}
      >
        <div
          className="mx-auto h-1.5 w-12 shrink-0 rounded-full bg-border-strong"
          aria-hidden="true"
        />
        {children}
      </Drawer.Content>
    </Drawer.Portal>
  );
}
