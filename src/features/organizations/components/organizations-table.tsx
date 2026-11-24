'use client';

import { Badge } from '@/components/ui/badge';
import { DataTable, type DataColumn } from '@/components/ui/table';
import { QuotaDialog } from './quota-dialog';
import { ReactivateDialog } from './reactivate-dialog';
import { SuspendDialog } from './suspend-dialog';

/** Row with values already formatted on the server (dates in the superadmin's time zone). */
export interface OrganizationTableRow {
  id: string;
  name: string;
  type: 'personal' | 'empresa';
  status: 'active' | 'suspended';
  suspendedReason: string | null;
  created: string;
  dailyLimit: number | null;
  monthlyLimit: number | null;
  monthSimulations: number;
}

const TYPE_LABELS = { personal: 'Personal', empresa: 'Empresa' } as const;

const columns: DataColumn<OrganizationTableRow>[] = [
  {
    key: 'name',
    header: 'Nombre',
    cell: (row) => <span className="font-medium break-words">{row.name}</span>,
  },
  { key: 'type', header: 'Tipo', cell: (row) => TYPE_LABELS[row.type] },
  {
    key: 'status',
    header: 'Estado',
    cell: (row) =>
      row.status === 'active' ? (
        <Badge variant="success">Activa</Badge>
      ) : (
        <div className="flex flex-col items-start gap-1">
          <Badge variant="danger">Suspendida</Badge>
          {row.suspendedReason ? (
            <span className="text-sm text-text-muted">Motivo: {row.suspendedReason}</span>
          ) : null}
        </div>
      ),
  },
  { key: 'created', header: 'Creación', cell: (row) => row.created },
  {
    key: 'quota',
    header: 'Cuota diaria / mensual',
    cell: (row) => (row.dailyLimit === null ? '—' : `${row.dailyLimit} / ${row.monthlyLimit}`),
  },
  { key: 'usage', header: 'Simulaciones del mes', cell: (row) => row.monthSimulations },
  {
    key: 'actions',
    header: 'Acciones',
    hideLabelOnMobile: true,
    cell: (row) => (
      <div className="flex flex-wrap gap-2">
        {row.dailyLimit !== null && row.monthlyLimit !== null ? (
          <QuotaDialog
            organizationId={row.id}
            organizationName={row.name}
            dailyLimit={row.dailyLimit}
            monthlyLimit={row.monthlyLimit}
          />
        ) : null}
        {row.status === 'active' ? (
          <SuspendDialog organizationId={row.id} organizationName={row.name} />
        ) : (
          <ReactivateDialog organizationId={row.id} organizationName={row.name} />
        )}
      </div>
    ),
  },
];

export function OrganizationsTable({ rows }: { rows: OrganizationTableRow[] }) {
  return (
    <DataTable
      caption="Organizaciones"
      columns={columns}
      rows={rows}
      rowKey={(row) => row.id}
      mobileTitle={(row) => <span className="break-words">{row.name}</span>}
    />
  );
}
