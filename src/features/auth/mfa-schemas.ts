import { z } from 'zod';
import { safeNext } from '@/lib/auth/safe-next';

/** TOTP schemas (contracts/server-actions.md → enrollMfa / confirmMfaEnrollment / verifyMfa). */
export const totpCode = z
  .string({ error: 'Escribe el código de 6 dígitos.' })
  .regex(/^\d{6}$/, { error: 'El código tiene 6 dígitos, sin espacios.' });

export const internalNext = z
  .string()
  .optional()
  .refine((value) => value === undefined || safeNext(value) !== null, {
    error: 'Destino no válido.',
  });

export const confirmMfaEnrollmentSchema = z.object({
  // guid(): any 8-4-4-4-12 hex id (seed ids are not RFC-variant UUIDs).
  factorId: z.guid({ error: 'Vuelve a generar el código QR.' }),
  code: totpCode,
});

export const verifyMfaSchema = z.object({
  code: totpCode,
  next: internalNext,
});
