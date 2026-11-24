import { z } from 'zod';
import { emailField } from '@/features/auth/schemas';
import { rowId } from '@/features/invitations/schemas';

/**
 * Public access request (contracts/server-actions.md → submitAccessRequest):
 * - data-model.md `access_requests.full_name` 1–80 (not only spaces), `access_requests.email`
 *   normalized, `access_requests.company_or_role` ≤ 120, `access_requests.message` ≤ 500.
 * - `acceptPrivacy` literal true; `privacyDocumentId` = `access_requests.privacy_document_id` (uuid).
 * - Anti-abuse (research.md §R12): honeypot `website` must be empty; `startedAt` is a signed timestamp
 *   checked on the server (signature + ≥ 3 s).
 */
export const ACCESS_REQUEST_MESSAGE_MAX = 500;
export const MIN_FILL_MS = 3_000;
export const PRIVACY_UPDATED_MESSAGE =
  'La política de privacidad se actualizó: revísala y acéptala de nuevo.';

const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, { error: `${label} puede tener hasta ${max} caracteres.` })
    .optional()
    .transform((value) => (value ? value : undefined));

export const submitAccessRequestSchema = z.object({
  fullName: z
    .string({ error: 'Escribe tu nombre.' })
    .trim()
    .min(1, { error: 'Escribe tu nombre.' })
    .max(80, { error: 'Tu nombre puede tener hasta 80 caracteres.' }),
  email: emailField,
  companyOrRole: optionalText(120, 'Empresa o cargo'),
  message: optionalText(ACCESS_REQUEST_MESSAGE_MAX, 'El mensaje'),
  acceptPrivacy: z.preprocess(
    (value) => value === 'on' || value === 'true' || value === true,
    z.literal(true, { error: 'Acepta la política de privacidad para continuar.' }),
  ),
  privacyDocumentId: rowId,
  website: z.literal('', { error: 'No pudimos procesar la solicitud.' }),
  startedAt: z
    .string()
    .regex(/^\d{1,16}\.[A-Za-z0-9_-]{43}$/, { error: 'No pudimos procesar la solicitud.' }),
});

export type SubmitAccessRequestInput = z.infer<typeof submitAccessRequestSchema>;

export const discardAccessRequestSchema = z.object({ accessRequestId: rowId });

export const ACCESS_REQUEST_STATUSES = ['new', 'invited', 'discarded'] as const;
export type AccessRequestStatus = (typeof ACCESS_REQUEST_STATUSES)[number];

/** List filters from the query string (invalid values are dropped). */
export const listAccessRequestsSchema = z
  .object({ estado: z.string().optional(), pagina: z.string().optional() })
  .transform(({ estado, pagina }) => {
    const status = ACCESS_REQUEST_STATUSES.find((s) => s === estado);
    const page = Number.parseInt(pagina ?? '', 10);
    return { ...(status ? { status } : {}), page: Number.isFinite(page) && page >= 1 ? page : 1 };
  });

export type AccessRequestListFilters = z.infer<typeof listAccessRequestsSchema>;
