import { History } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { CautivaStrip } from '@/components/ui/cautiva-strip';
import { EmptyState } from '@/components/ui/empty-state';
import { Pagination } from '@/components/ui/pagination';
import { ScoreTrendChart } from '@/components/ui/score-trend-chart';
import { HistoryFilters } from '@/features/history/components/history-filters';
import { HistoryList } from '@/features/history/components/history-list';
import { getHistory } from '@/features/history/queries';
import { historyQueryString, parseHistoryFilters } from '@/features/history/schemas';

export const metadata: Metadata = { title: 'Historial' };

/**
 * Historial (US8; contracts/routes.md; FR-049, FR-050): started sessions with filters kept in the
 * URL, the evolution chart (≥ 2 evaluated) with "Ver como tabla" and the filtered C.A.U.T.I.V.A.™
 * strip. Empty: "Configura tu primera práctica".
 */
export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filters = parseHistoryFilters(await searchParams);
  const history = await getHistory(filters);
  const filtered = Boolean(filters.product || filters.difficulty || filters.from || filters.to);

  if (history.total === 0 && !filtered) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-3xl">Historial</h1>
        <EmptyState
          icon={History}
          title="Aún no tienes prácticas"
          description="Aquí verás cada práctica que comiences, su puntaje y cómo evolucionas por etapa."
          action={
            <Link href="/practicar" className={buttonVariants({ variant: 'primary' })}>
              Configura tu primera práctica
            </Link>
          }
        />
      </div>
    );
  }

  const hrefFor = (page: number) => {
    const query = historyQueryString(filters, { page });
    return query ? `/historial?${query}` : '/historial';
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl">Historial</h1>
        <p className="text-text-muted" data-testid="history-count">
          {history.total === 1 ? '1 práctica' : `${history.total} prácticas`}
          {filtered ? ' con estos filtros' : ''}
        </p>
      </div>
      <HistoryFilters filters={filters} products={history.products} />

      {history.trend.length >= 2 ? <ScoreTrendChart points={history.trend} /> : null}
      <CautivaStrip
        stages={history.stages}
        description={
          filtered ? 'Promedio de las prácticas evaluadas con estos filtros.' : undefined
        }
      />

      {history.rows.length > 0 ? (
        <HistoryList rows={history.rows} timezone={history.timezone} />
      ) : (
        <EmptyState
          icon={History}
          title="No hay prácticas con estos filtros"
          description="Cambia o limpia los filtros para ver más."
          action={
            <Link href="/historial" className={buttonVariants({ variant: 'secondary' })}>
              Limpiar filtros
            </Link>
          }
        />
      )}
      <Pagination
        page={filters.page}
        pageCount={history.pageCount}
        hrefFor={hrefFor}
        label="Páginas del historial"
      />
    </div>
  );
}
