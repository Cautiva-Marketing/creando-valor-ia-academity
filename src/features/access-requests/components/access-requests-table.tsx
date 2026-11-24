'use client';

import { MailPlus } from 'lucide-react';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { toast } from '@/components/ui/sonner';
import { DataTable, type DataColumn } from '@/components/ui/table';
import { discardAccessRequest } from '../actions';
import type { AccessRequestStatus } from '../schemas';

/** Row with the date already formatted on the server (superadmin's time zone). */
export interface AccessRequestTableRow {
  id: string;
  status: AccessRequestStatus;
  fullName: string | null;
  email: string | null;
  companyOrRole: string | null;
  message: string | null;
  created: string;
  anonymized: boolean;
  discardedBySystem: boolean;
}

export const ACCESS_REQUEST_STATUS_LABELS: Record<AccessRequestStatus, string> = {
  new: 'Nueva',
  invited: 'Invitada',
  discarded: 'Descartada',
};

const STATUS_VARIANTS = { new: 'info', invited: 'success', discarded: 'neutral' } as const;

function DiscardDialog({ id, label }: { id: string; label: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const confirm = () =>
    startTransition(async () => {
      const result = await discardAccessRequest({ accessRequestId: id });
      if (result.ok) toast.success('Descartamos la solicitud.');
      else toast.error(result.message);
      setOpen(false);
    });
  return (
    <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          Descartar
          <span className="sr-only"> la solicitud de {label}</span>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>¿Descartar la solicitud de {label}?</DialogTitle>
          <DialogDescription>
            No se enviará invitación. Sus datos se eliminarán automáticamente a los 90 días.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost" disabled={pending}>
              Cancelar
            </Button>
          </DialogClose>
          <Button
            variant="destructive"
            onClick={confirm}
            loading={pending}
            loadingLabel="Descartando…"
          >
            Descartar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const columns: DataColumn<AccessRequestTableRow>[] = [
  {
    key: 'person',
    header: 'Persona',
    cell: (row) =>
      row.anonymized ? (
        <span className="text-text-muted">Datos eliminados</span>
      ) : (
        <div className="flex flex-col">
          <span className="font-medium break-words">{row.fullName}</span>
          <span className="break-all text-text-muted">{row.email}</span>
        </div>
      ),
  },
  {
    key: 'company',
    header: 'Empresa o cargo',
    cell: (row) => (row.anonymized ? '—' : (row.companyOrRole ?? '—')),
  },
  {
    key: 'message',
    header: 'Mensaje',
    cell: (row) =>
      row.anonymized || !row.message ? '—' : <span className="break-words">{row.message}</span>,
  },
  {
    key: 'status',
    header: 'Estado',
    cell: (row) => (
      <div className="flex flex-col items-start gap-1">
        <Badge variant={STATUS_VARIANTS[row.status]}>
          {ACCESS_REQUEST_STATUS_LABELS[row.status]}
        </Badge>
        {row.discardedBySystem ? (
          <span className="text-sm text-text-muted">Descartada automáticamente</span>
        ) : null}
      </div>
    ),
  },
  { key: 'created', header: 'Recibida', cell: (row) => row.created },
  {
    key: 'actions',
    header: 'Acciones',
    hideLabelOnMobile: true,
    cell: (row) =>
      row.status === 'new' && !row.anonymized ? (
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm">
            <Link href={`/admin/invitaciones/nueva?solicitud=${row.id}`}>
              <MailPlus aria-hidden="true" />
              Convertir en invitación
              <span className="sr-only"> para {row.fullName}</span>
            </Link>
          </Button>
          <DiscardDialog id={row.id} label={row.fullName ?? 'esta persona'} />
        </div>
      ) : (
        <span className="text-text-muted">—</span>
      ),
  },
];

export function AccessRequestsTable({ rows }: { rows: AccessRequestTableRow[] }) {
  return (
    <DataTable
      caption="Solicitudes de acceso"
      columns={columns}
      rows={rows}
      rowKey={(row) => row.id}
      mobileTitle={(row) =>
        row.anonymized ? (
          'Solicitud anonimizada'
        ) : (
          <span className="break-words">{row.fullName}</span>
        )
      }
    />
  );
}
