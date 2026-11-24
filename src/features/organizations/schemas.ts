import { z } from 'zod';
import { rowId } from '@/features/invitations/schemas';

/**
 * Organization administration (contracts/server-actions.md):
 * - updateQuota: data-model.md `quotas.daily_limit` / `quotas.monthly_limit` (integers ≥ 0,
 *   daily ≤ monthly, error on the daily field).
 * - suspendOrganization: data-model.md `organizations.suspended_reason` (trim, 1–500).
 */

const limit = (label: string) =>
  z.coerce
    .number({ error: `Indica el límite ${label}.` })
    .int({ error: `El límite ${label} debe ser un número entero.` })
    .min(0, { error: `El límite ${label} no puede ser negativo.` })
    .max(1_000_000, { error: `El límite ${label} es demasiado alto.` });

export const updateQuotaSchema = z
  .object({
    organizationId: rowId,
    dailyLimit: limit('diario'),
    monthlyLimit: limit('mensual'),
  })
  .refine((value) => value.dailyLimit <= value.monthlyLimit, {
    path: ['dailyLimit'],
    error: 'El límite diario no puede ser mayor que el mensual.',
  });

export const SUSPENSION_REASON_MAX = 500;

export const suspendOrganizationSchema = z.object({
  organizationId: rowId,
  reason: z
    .string({ error: 'Escribe el motivo de la suspensión.' })
    .trim()
    .min(1, { error: 'Escribe el motivo de la suspensión.' })
    .max(SUSPENSION_REASON_MAX, {
      error: `El motivo puede tener hasta ${SUSPENSION_REASON_MAX} caracteres.`,
    }),
});

export const reactivateOrganizationSchema = z.object({ organizationId: rowId });

/** List filters from the query string (invalid values are dropped). */
export const listOrganizationsSchema = z
  .object({ q: z.string().optional(), pagina: z.string().optional() })
  .transform(({ q, pagina }) => {
    const query = q?.trim().slice(0, 120);
    const page = Number.parseInt(pagina ?? '', 10);
    return { ...(query ? { q: query } : {}), page: Number.isFinite(page) && page >= 1 ? page : 1 };
  });

export type OrganizationListFilters = z.infer<typeof listOrganizationsSchema>;
