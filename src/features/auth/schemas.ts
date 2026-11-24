import { z } from 'zod';
import { safeNext } from '@/lib/auth/safe-next';
import { PASSWORD_MIN_LENGTH } from '@/lib/security/password-rules';

/** Shared field schemas (contracts/server-actions.md → normalized emails, internal `next`). */
export const emailField = z
  .string({ error: 'Escribe tu correo electrónico.' })
  .trim()
  .toLowerCase()
  .min(1, { error: 'Escribe tu correo electrónico.' })
  .max(254, { error: 'El correo es demasiado largo.' })
  .pipe(z.email({ error: 'Escribe un correo válido, por ejemplo nombre@empresa.com.' }));

export const passwordField = z
  .string({ error: 'Escribe una contraseña.' })
  .min(PASSWORD_MIN_LENGTH, { error: `Usa al menos ${PASSWORD_MIN_LENGTH} caracteres.` })
  .max(200, { error: 'Usa como máximo 200 caracteres.' });

/** Optional `next`: external or malformed values are dropped (never an error for the user). */
export const lenientNext = z
  .string()
  .optional()
  .transform((value) => safeNext(value) ?? undefined);

export const signInSchema = z.object({
  email: emailField,
  password: z
    .string({ error: 'Escribe tu contraseña.' })
    .min(1, { error: 'Escribe tu contraseña.' })
    .max(200, { error: 'Correo o contraseña incorrectos.' }),
  next: lenientNext,
});

export const requestPasswordResetSchema = z.object({ email: emailField });

export const resetPasswordSchema = z.object({ password: passwordField });

/** Query of /auth/confirm, validated before calling Auth (contracts/routes.md). */
export const authConfirmParams = z.object({
  token_hash: z.string().regex(/^[A-Za-z0-9_-]{1,256}$/),
  type: z.literal('recovery'),
  next: z
    .string()
    .optional()
    .refine((value) => value === undefined || safeNext(value) !== null),
});

export type SignInInput = z.infer<typeof signInSchema>;

/** FormData → plain object of strings (files and repeated keys are not used by these forms). */
export function formValues(
  formData: FormData,
  keys: readonly string[],
): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const key of keys) {
    const value = formData.get(key);
    out[key] = typeof value === 'string' && value !== '' ? value : undefined;
  }
  return out;
}

/** Zod issues → `fieldErrors` of ActionResult. */
export function fieldErrorsOf(error: z.ZodError): Record<string, string[]> {
  return z.flattenError(error).fieldErrors as Record<string, string[]>;
}
