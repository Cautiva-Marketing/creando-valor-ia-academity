'use client';

import { useTheme } from 'next-themes';
import { Toaster as Sonner, type ToasterProps } from 'sonner';

/** Toasts with tokens; sonner renders an aria-live region (polite) for announcements. */
export function Toaster(props: ToasterProps) {
  const { resolvedTheme } = useTheme();
  return (
    <Sonner
      theme={resolvedTheme === 'dark' ? 'dark' : 'light'}
      position="top-center"
      closeButton
      containerAriaLabel="Notificaciones"
      toastOptions={{
        classNames: {
          toast: 'rounded-lg border border-border bg-surface-raised text-text shadow-lg font-sans',
          description: 'text-text-muted',
          actionButton: 'bg-primary text-on-primary',
          cancelButton: 'bg-surface-sunken text-text',
          success: 'border-success',
          error: 'border-danger',
        },
      }}
      {...props}
    />
  );
}

export { toast } from 'sonner';
