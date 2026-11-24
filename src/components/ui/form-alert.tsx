import { AlertCircle, CheckCircle2, Info } from 'lucide-react';
import * as React from 'react';
import { cn } from '@/lib/utils';

const tones = {
  error: { icon: AlertCircle, className: 'border-danger text-text', iconClass: 'text-danger' },
  success: { icon: CheckCircle2, className: 'border-success text-text', iconClass: 'text-success' },
  info: { icon: Info, className: 'border-info text-text', iconClass: 'text-info' },
} as const;

/** Form-level message. Errors use role="alert"; others are polite status updates. */
export function FormAlert({
  tone = 'error',
  title,
  children,
  className,
  ...props
}: React.ComponentProps<'div'> & { tone?: keyof typeof tones; title?: string }) {
  const { icon: Icon, className: toneClass, iconClass } = tones[tone];
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn('flex gap-3 rounded-md border-l-4 bg-surface-sunken p-3', toneClass, className)}
      {...props}
    >
      <Icon className={cn('mt-0.5 size-5 shrink-0', iconClass)} aria-hidden="true" />
      <div className="flex flex-col gap-1">
        {title ? <p className="font-semibold">{title}</p> : null}
        <div>{children}</div>
      </div>
    </div>
  );
}
