import { Mail, Plus } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Pagination } from '@/components/ui/pagination';
import { InvitationFilters } from '@/features/invitations/components/invitation-filters';
import { InvitationsTable } from '@/features/invitations/components/invitations-table';
import { listInvitations } from '@/features/invitations/queries';
import { listInvitationsSchema } from '@/features/invitations/schemas';
import { formatDateTime } from '@/lib/format';

export const metadata: Metadata = { title: 'Invitaciones' };

export default async function InvitationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const filters = listInvitationsSchema.parse({
    estado: typeof params.estado === 'string' ? params.estado : undefined,
    q: typeof params.q === 'string' ? params.q : undefined,
    pagina: typeof params.pagina === 'string' ? params.pagina : undefined,
  });
  const { rows, total, pageCount, timezone } = await listInvitations(filters);
  const filtered = Boolean(filters.status || filters.q);

  const hrefFor = (page: number) => {
    const query = new URLSearchParams();
    if (filters.status) query.set('estado', filters.status);
    if (filters.q) query.set('q', filters.q);
    if (page > 1) query.set('pagina', String(page));
    const qs = query.toString();
    return qs ? `/admin/invitaciones?${qs}` : '/admin/invitaciones';
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl">Invitaciones</h1>
          <p className="text-text-muted">
            {total === 1 ? '1 invitación' : `${total} invitaciones`}
            {filtered ? ' con estos filtros' : ''}
          </p>
        </div>
        <Button asChild>
          <Link href="/admin/invitaciones/nueva">
            <Plus aria-hidden="true" />
            Nueva invitación
          </Link>
        </Button>
      </div>

      <InvitationFilters filters={filters} />

      {rows.length === 0 ? (
        <EmptyState
          icon={Mail}
          title={filtered ? 'No hay invitaciones con estos filtros' : 'Aún no hay invitaciones'}
          description={
            filtered
              ? 'Prueba con otro estado o busca otro correo.'
              : 'Invita a tu primer vendedor: recibirá un correo para activar su cuenta.'
          }
          action={
            filtered ? (
              <Button asChild variant="secondary">
                <Link href="/admin/invitaciones">Quitar filtros</Link>
              </Button>
            ) : (
              <Button asChild>
                <Link href="/admin/invitaciones/nueva">Nueva invitación</Link>
              </Button>
            )
          }
        />
      ) : (
        <InvitationsTable
          rows={rows.map((row) => ({
            id: row.id,
            email: row.email,
            status: row.status,
            expires: formatDateTime(row.expiresAt, timezone),
            lastSent: row.lastSentAt ? formatDateTime(row.lastSentAt, timezone) : null,
            sendFailed:
              row.sendStatus === 'failed' && (row.status === 'pending' || row.status === 'expired'),
          }))}
        />
      )}

      <Pagination
        page={filters.page}
        pageCount={pageCount}
        hrefFor={hrefFor}
        label="Páginas de invitaciones"
      />
    </div>
  );
}
