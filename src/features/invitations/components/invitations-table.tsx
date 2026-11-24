'use client';

import { AlertTriangle } from 'lucide-react';
import { DataTable, type DataColumn } from '@/components/ui/table';
import type { InvitationStatus } from '../schemas';
import { ResendInvitationDialog, RevokeInvitationDialog } from './invitation-dialogs';
import { InvitationStatusBadge } from './status';

/** Row with dates already formatted on the server in the superadmin's time zone (FR-036). */
export interface InvitationTableRow {
  id: string;
  email: string;
  status: InvitationStatus;
  expires: string;
  lastSent: string | null;
  sendFailed: boolean;
}

const columns: DataColumn<InvitationTableRow>[] = [
  {
    key: 'email',
    header: 'Correo',
    cell: (row) => <span className="font-medium break-all">{row.email}</span>,
  },
  {
    key: 'status',
    header: 'Estado',
    cell: (row) => (
      <div className="flex flex-col items-start gap-1">
        <InvitationStatusBadge status={row.status} />
        {row.sendFailed ? (
          <span className="inline-flex items-center gap-1 text-sm font-medium text-danger">
            <AlertTriangle className="size-4" aria-hidden="true" />
            Envío fallido
          </span>
        ) : null}
      </div>
    ),
  },
  { key: 'expires', header: 'Vence', cell: (row) => row.expires },
  { key: 'lastSent', header: 'Último envío', cell: (row) => row.lastSent ?? '—' },
  {
    key: 'actions',
    header: 'Acciones',
    hideLabelOnMobile: true,
    cell: (row) =>
      row.status === 'pending' || row.status === 'expired' ? (
        <div className="flex flex-wrap gap-2">
          <ResendInvitationDialog invitationId={row.id} email={row.email} retry={row.sendFailed} />
          <RevokeInvitationDialog invitationId={row.id} email={row.email} />
        </div>
      ) : (
        <span className="text-text-muted">—</span>
      ),
  },
];

export function InvitationsTable({ rows }: { rows: InvitationTableRow[] }) {
  return (
    <DataTable
      caption="Invitaciones"
      columns={columns}
      rows={rows}
      rowKey={(row) => row.id}
      mobileTitle={(row) => <span className="break-all">{row.email}</span>}
    />
  );
}
