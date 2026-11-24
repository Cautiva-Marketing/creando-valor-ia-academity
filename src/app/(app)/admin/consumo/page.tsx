import { BarChart3 } from 'lucide-react';
import type { Metadata } from 'next';
import { EmptyState } from '@/components/ui/empty-state';
import { PeriodSelector } from '@/features/usage/components/period-selector';
import { UsageTable } from '@/features/usage/components/usage-table';
import { USAGE_PERIOD_LABELS, resolvePeriod } from '@/features/usage/periods';
import { getUsageSummary } from '@/features/usage/queries';
import { usageSearchSchema } from '@/features/usage/schemas';
import { fieldErrorsOf } from '@/features/auth/schemas';
import { requireSuperadmin } from '@/lib/auth/guards';
import { formatDate } from '@/lib/format';

export const metadata: Metadata = { title: 'Consumo de IA' };

const one = (value: string | string[] | undefined) =>
  typeof value === 'string' && value ? value : undefined;

export default async function UsagePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireSuperadmin('/admin/consumo');
  const params = await searchParams;
  const parsed = usageSearchSchema.safeParse({
    periodo: one(params.periodo),
    desde: one(params.desde),
    hasta: one(params.hasta),
  });
  // Invalid filters fall back to the current month and explain why.
  const search = parsed.success ? parsed.data : { periodo: 'current_month' as const };
  const errors = parsed.success ? undefined : Object.values(fieldErrorsOf(parsed.error)).flat();
  const range = resolvePeriod(search.periodo, {
    timeZone: ctx.timezone,
    range:
      search.periodo === 'range' && search.desde && search.hasta
        ? { from: search.desde, to: search.hasta }
        : undefined,
  });
  const summary = await getUsageSummary(range);
  const label =
    range.from === range.to
      ? formatDate(`${range.from}T12:00:00Z`, 'UTC')
      : `${formatDate(`${range.from}T12:00:00Z`, 'UTC')} – ${formatDate(`${range.to}T12:00:00Z`, 'UTC')}`;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl">Consumo de IA</h1>
        <p className="text-text-muted">
          {USAGE_PERIOD_LABELS[search.periodo]}: {label}. Cada organización se cuenta por días de su
          propia zona horaria. Solo datos agregados, sin contenido de conversaciones.
        </p>
      </div>
      <PeriodSelector
        period={search.periodo}
        from={one(params.desde)}
        to={one(params.hasta)}
        errors={errors}
      />
      {summary.rows.length === 0 ? (
        <EmptyState
          icon={BarChart3}
          title="Sin consumo en este periodo"
          description="Aquí verás simulaciones, tokens y costo estimado por organización cuando haya uso de IA en las fechas elegidas."
        />
      ) : (
        <UsageTable summary={summary} />
      )}
    </div>
  );
}
