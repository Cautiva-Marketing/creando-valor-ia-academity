import { z } from 'zod';
import { emailField } from '@/features/auth/schemas';

/**
 * Invitation schemas (contracts/server-actions.md; data-model.md `invitations.email`,
 * `invitations.expires_in_days`, `invitations.idempotency_key`, `invitations.resend_idempotency_key`).
 *
 * Row ids use `z.guid()` (8-4-4-4-12 hex): the documented seed ids are not RFC-variant UUIDs.
 * Idempotency keys come from `crypto.randomUUID()` and use the strict `z.uuid()`.
 */
export const INVITATION_STATUSES = ['pending', 'accepted', 'expired', 'revoked'] as const;
export type InvitationStatus = (typeof INVITATION_STATUSES)[number];

export const rowId = z.guid({ error: 'Identificador no válido.' });
const idempotencyKey = z.uuid({ error: 'Vuelve a abrir el formulario e inténtalo de nuevo.' });

export const createInvitationSchema = z.object({
  email: emailField,
  expiresInDays: z.coerce
    .number({ error: 'Indica el plazo en días.' })
    .int({ error: 'El plazo es un número entero de días.' })
    .min(1, { error: 'El plazo mínimo es 1 día.' })
    .max(30, { error: 'El plazo máximo es 30 días.' })
    .default(7),
  accessRequestId: rowId.optional(),
  idempotencyKey,
});

export const resendInvitationSchema = z.object({ invitationId: rowId, idempotencyKey });

export const revokeInvitationSchema = z.object({ invitationId: rowId });

/** `?solicitud=` of /admin/invitaciones/nueva (used by US10). */
export const convertibleRequestParam = rowId;

/** List filters from the query string; invalid values are dropped, never an error. */
export const listInvitationsSchema = z
  .object({
    estado: z.string().optional(),
    q: z.string().optional(),
    pagina: z.string().optional(),
  })
  .transform(({ estado, q, pagina }) => {
    const status = INVITATION_STATUSES.find((s) => s === estado);
    const query = q?.trim().slice(0, 254);
    const page = Number.parseInt(pagina ?? '', 10);
    return {
      ...(status ? { status } : {}),
      ...(query ? { q: query } : {}),
      page: Number.isFinite(page) && page >= 1 ? page : 1,
    };
  });

export type InvitationListFilters = z.infer<typeof listInvitationsSchema>;
