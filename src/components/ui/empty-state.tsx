import type { LucideIcon } from 'lucide-react';
import * as React from 'react';
import { cn } from '@/lib/utils';

interface EmptyStateProps extends React.ComponentProps<'div'> {
  icon?: LucideIcon;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
  ...props
}: EmptyStateProps) {
  return (
    <div
      data-slot="empty-state"
      className={cn(
        'flex flex-col items-center gap-3 rounded-lg border border-dashed border-border-strong px-6 py-10 text-center',
        className,
      )}
      {...props}
    >
      {Icon ? <Icon className="size-10 text-accent-strong" aria-hidden="true" /> : null}
      <h2 className="text-lg">{title}</h2>
      {description ? <p className="max-w-prose text-text-muted">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
