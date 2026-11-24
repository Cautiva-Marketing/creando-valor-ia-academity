import { Building2, Search } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Pagination } from '@/components/ui/pagination';
import { OrganizationsTable } from '@/features/organizations/components/organizations-table';
import { listOrganizations } from '@/features/organizations/queries';
import { listOrganizationsSchema } from '@/features/organizations/schemas';
import { formatDate } from '@/lib/format';

export const metadata: Metadata = { title: 'Organizaciones' };

export default async function OrganizationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const filters = listOrganizationsSchema.parse({
    q: typeof params.q === 'string' ? params.q : undefined,
    pagina: typeof params.pagina === 'string' ? params.pagina : undefined,
  });
  const { rows, total, pageCount, timezone } = await listOrganizations(filters);

  const hrefFor = (page: number) => {
    const query = new URLSearchParams();
    if (filters.q) query.set('q', filters.q);
    if (page > 1) query.set('pagina', String(page));
    const qs = query.toString();
    return qs ? `/admin/organizaciones?${qs}` : '/admin/organizaciones';
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl">Organizaciones</h1>
        <p className="text-text-muted">
          {total === 1 ? '1 organización' : `${total} organizaciones`}
          {filters.q ? ' con esta búsqueda' : ''} · consumo del mes en la zona horaria de cada
          organización
        </p>
      </div>

      <form role="search" method="get" className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="q">Buscar por nombre</Label>
          <Input id="q" name="q" type="search" defaultValue={filters.q ?? ''} autoComplete="off" />
        </div>
        <Button type="submit" variant="secondary">
          <Search aria-hidden="true" />
          Buscar
        </Button>
      </form>

      {rows.length === 0 ? (
        <EmptyState
          icon={Building2}
          title={filters.q ? 'No hay organizaciones con esa búsqueda' : 'Aún no hay organizaciones'}
          description={
            filters.q
              ? 'Prueba con otro nombre.'
              : 'Cada persona que activa su invitación crea su organización personal.'
          }
          action={
            filters.q ? (
              <Button asChild variant="secondary">
                <Link href="/admin/organizaciones">Quitar búsqueda</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <OrganizationsTable
          rows={rows.map((row) => ({
            id: row.id,
            name: row.name,
            type: row.type,
            status: row.status,
            suspendedReason: row.suspendedReason,
            created: formatDate(row.createdAt, timezone),
            dailyLimit: row.dailyLimit,
            monthlyLimit: row.monthlyLimit,
            monthSimulations: row.monthSimulations,
          }))}
        />
      )}

      <Pagination
        page={filters.page}
        pageCount={pageCount}
        hrefFor={hrefFor}
        label="Páginas de organizaciones"
      />
    </div>
  );
}
