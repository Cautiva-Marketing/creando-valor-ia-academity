import { Badge } from '@/components/ui/badge';
import type { InvitationStatus } from '../schemas';

/** Spanish labels live only in the UI (identifiers stay in English). */
export const INVITATION_STATUS_LABELS: Record<InvitationStatus, string> = {
  pending: 'Pendiente',
  accepted: 'Aceptada',
  expired: 'Vencida',
  revoked: 'Revocada',
};

const variants = {
  pending: 'info',
  accepted: 'success',
  expired: 'warning',
  revoked: 'neutral',
} as const;

export function InvitationStatusBadge({ status }: { status: InvitationStatus }) {
  return <Badge variant={variants[status]}>{INVITATION_STATUS_LABELS[status]}</Badge>;
}
