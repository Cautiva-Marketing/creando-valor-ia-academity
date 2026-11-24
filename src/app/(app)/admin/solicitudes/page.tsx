import { Filter, Inbox } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { fieldControlClass } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Pagination } from '@/components/ui/pagination';
import {
  ACCESS_REQUEST_STATUS_LABELS,
  AccessRequestsTable,
} from '@/features/access-requests/components/access-requests-table';
import { countNewAccessRequests, listAccessRequests } from '@/features/access-requests/queries';
import {
  ACCESS_REQUEST_STATUSES,
  listAccessRequestsSchema,
} from '@/features/access-requests/schemas';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';

export const metadata: Metadata = { title: 'Solicitudes de acceso' };

/** Access request inbox (H10, FR-049): new counter, status filter, convert, discard. */
export default async function AccessRequestsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const filters = listAccessRequestsSchema.parse({
    estado: typeof params.estado === 'string' ? params.estado : undefined,
    pagina: typeof params.pagina === 'string' ? params.pagina : undefined,
  });
  const [{ rows, pageCount, timezone }, newCount] = await Promise.all([
    listAccessRequests(filters),
    countNewAccessRequests(),
  ]);

  const hrefFor = (page: number) => {
    const query = new URLSearchParams();
    if (filters.status) query.set('estado', filters.status);
    if (page > 1) query.set('pagina', String(page));
    const qs = query.toString();
    return qs ? `/admin/solicitudes?${qs}` : '/admin/solicitudes';
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl">Solicitudes de acceso</h1>
        <p className="text-text-muted" data-testid="new-requests-count">
          {newCount === 1 ? '1 solicitud nueva' : `${newCount ?? 0} solicitudes nuevas`}
        </p>
      </div>

      <form role="search" method="get" className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="estado">Estado</Label>
          <select
            id="estado"
            name="estado"
            defaultValue={filters.status ?? ''}
            className={cn(fieldControlClass, 'min-h-touch py-2 sm:w-44')}
          >
            <option value="">Todas</option>
            {ACCESS_REQUEST_STATUSES.map((status) => (
              <option key={status} value={status}>
                {ACCESS_REQUEST_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" variant="secondary">
          <Filter aria-hidden="true" />
          Filtrar
        </Button>
      </form>

      {rows.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title={filters.status ? 'No hay solicitudes con ese estado' : 'Aún no hay solicitudes'}
          description={
            filters.status
              ? 'Prueba con otro estado.'
              : 'Las personas que pidan acceso desde la página pública aparecerán aquí.'
          }
          action={
            filters.status ? (
              <Button asChild variant="secondary">
                <Link href="/admin/solicitudes">Ver todas</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <AccessRequestsTable
          rows={rows.map((row) => ({
            id: row.id,
            status: row.status,
            fullName: row.fullName,
            email: row.email,
            companyOrRole: row.companyOrRole,
            message: row.message,
            created: formatDateTime(row.createdAt, timezone),
            anonymized: row.anonymized,
            discardedBySystem: row.discardedBySystem,
          }))}
        />
      )}

      <Pagination
        page={filters.page}
        pageCount={pageCount}
        hrefFor={hrefFor}
        label="Páginas de solicitudes"
      />
    </div>
  );
}
