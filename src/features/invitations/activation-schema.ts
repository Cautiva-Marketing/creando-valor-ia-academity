import { z } from 'zod';
import { passwordField } from '@/features/auth/schemas';
import { rowId } from './schemas';

/**
 * Account activation (contracts/server-actions.md → activateAccount).
 * - `fullName`: data-model.md `profiles.full_name` (1..80, not only spaces).
 * - `termsDocumentId` / `aiNoticeDocumentId`: data-model.md `legal_acceptances.document_id`, the
 *   versions the page showed (hidden fields rendered on the server).
 */

/** Route param `[token]`: 32 random bytes in base64url without padding = 43 characters. */
export const invitationTokenParam = z
  .string()
  .regex(/^[A-Za-z0-9_-]{43}$/, { error: 'Enlace no válido.' });

const checkbox = (message: string) =>
  z.preprocess(
    (v) => v === 'on' || v === 'true' || v === true,
    z.literal(true, { error: message }),
  );

export const activateAccountSchema = z.object({
  token: invitationTokenParam,
  fullName: z
    .string({ error: 'Escribe tu nombre.' })
    .trim()
    .min(1, { error: 'Escribe tu nombre.' })
    .max(80, { error: 'El nombre puede tener hasta 80 caracteres.' }),
  password: passwordField,
  acceptTerms: checkbox('Debes aceptar los términos y condiciones.'),
  acceptAiNotice: checkbox('Debes aceptar el aviso de uso de IA.'),
  termsDocumentId: rowId,
  aiNoticeDocumentId: rowId,
});

export type ActivateAccountInput = z.infer<typeof activateAccountSchema>;
