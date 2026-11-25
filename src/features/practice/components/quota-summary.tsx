import { Gauge } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { QuotaStatus } from '../queries';

/** "Te quedan X simulaciones hoy y Y este mes" (FR-014, FR-017). Reused on Hoy and Practicar. */
function simulations(n: number): string {
  return n === 1 ? '1 simulación' : `${n} simulaciones`;
}

export function quotaSummaryText(quota: Pick<QuotaStatus, 'remainingToday' | 'remainingMonth'>) {
  return `Te quedan ${simulations(quota.remainingToday)} hoy y ${quota.remainingMonth} este mes.`;
}

export function QuotaSummary({
  quota,
  className,
}: {
  quota: Pick<QuotaStatus, 'remainingToday' | 'remainingMonth'>;
  className?: string;
}) {
  return (
    <p
      data-testid="quota-summary"
      className={cn('flex items-center gap-2 text-sm text-text-muted', className)}
    >
      <Gauge className="size-4 shrink-0 text-accent-strong" aria-hidden="true" />
      {quotaSummaryText(quota)}
    </p>
  );
}
