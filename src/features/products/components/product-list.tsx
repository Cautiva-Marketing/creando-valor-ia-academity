import { ChevronRight, MessageSquareWarning, Package, Search } from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatPENRange } from '@/lib/format';
import { SECTOR_LABELS } from '@/features/practice/domain/labels';
import type { ProductListRow } from '../queries';
import type { ProductListQuery } from '../schemas';

/** Active/archived filter as links (current one marked) plus a GET search form (no JS needed). */
export function ProductFilters({ query }: { query: ProductListQuery }) {
  const tab = (estado: ProductListQuery['estado'], label: string) => {
    const params = new URLSearchParams();
    if (estado === 'archivados') params.set('estado', estado);
    if (query.q) params.set('q', query.q);
    const href = params.size ? `/productos?${params}` : '/productos';
    const current = query.estado === estado;
    return (
      <Link
        href={href}
        aria-current={current ? 'page' : undefined}
        className={
          current
            ? 'inline-flex min-h-touch items-center rounded-md bg-surface-raised px-4 font-medium text-text shadow-sm'
            : 'inline-flex min-h-touch items-center rounded-md px-4 font-medium text-text-muted hover:text-text'
        }
      >
        {label}
      </Link>
    );
  };

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <nav
        aria-label="Estado de los productos"
        className="inline-flex w-fit gap-1 rounded-lg bg-surface-sunken p-1"
      >
        {tab('activos', 'Activos')}
        {tab('archivados', 'Archivados')}
      </nav>
      <form role="search" method="get" className="flex items-end gap-2">
        {query.estado === 'archivados' ? (
          <input type="hidden" name="estado" value="archivados" />
        ) : null}
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="q">Buscar por nombre</Label>
          <Input
            id="q"
            name="q"
            type="search"
            defaultValue={query.q ?? ''}
            maxLength={80}
            autoComplete="off"
          />
        </div>
        <Button type="submit" variant="secondary">
          <Search aria-hidden="true" />
          Buscar
        </Button>
      </form>
    </div>
  );
}

/** Responsive list: one card per product with price, version, objections and status (FR-004). */
export function ProductList({ rows }: { rows: ProductListRow[] }) {
  return (
    <ul className="grid gap-3 md:grid-cols-2" aria-label="Productos">
      {rows.map((row) => (
        <li key={row.id}>
          <Link
            href={`/productos/${row.id}`}
            className="group flex h-full items-center gap-3 rounded-lg border border-border bg-surface-raised p-4 hover:border-border-strong focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
          >
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg break-words">{row.name}</h2>
                {row.status === 'archived' ? <Badge>Archivado</Badge> : null}
              </div>
              <p className="text-sm text-text-muted">
                {row.sector ? SECTOR_LABELS[row.sector] : '—'} · Versión {row.currentVersion}
              </p>
              <p className="font-medium tabular-nums">
                {row.priceMin !== null && row.priceMax !== null
                  ? formatPENRange(row.priceMin, row.priceMax)
                  : '—'}
              </p>
              <p className="flex items-center gap-1.5 text-sm text-text-muted">
                <MessageSquareWarning className="size-4" aria-hidden="true" />
                {row.objectionCount === 1 ? '1 objeción' : `${row.objectionCount} objeciones`}
              </p>
            </div>
            <ChevronRight className="size-5 shrink-0 text-text-muted" aria-hidden="true" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** First-run empty state (US1 scenario 1) and "nothing to show here" states. */
export function ProductsEmpty({
  firstRun,
  filtered,
  archived,
}: {
  firstRun: boolean;
  filtered: boolean;
  archived: boolean;
}) {
  if (firstRun) {
    return (
      <EmptyState
        icon={Package}
        title="Aún no registras productos"
        description="Registra lo que vendes (precio, beneficios y datos que el cliente puede verificar). Con eso preparamos a tu cliente simulado y evaluamos tus prácticas."
        action={
          <Button asChild>
            <Link href="/productos/nuevo">Registrar mi primer producto</Link>
          </Button>
        }
      />
    );
  }
  const [title, description] = filtered
    ? ['No hay productos con ese nombre', 'Prueba con otra palabra o quita la búsqueda.']
    : archived
      ? [
          'No tienes productos archivados',
          'Cuando archives un producto aparecerá aquí y podrás reactivarlo.',
        ]
      : [
          'No tienes productos activos',
          'Registra uno nuevo o reactiva alguno de tus productos archivados.',
        ];
  return (
    <EmptyState
      icon={Package}
      title={title}
      description={description}
      action={
        <Button asChild variant="secondary">
          <Link href={archived || filtered ? '/productos' : '/productos?estado=archivados'}>
            {archived || filtered ? 'Ver productos activos' : 'Ver archivados'}
          </Link>
        </Button>
      }
    />
  );
}
