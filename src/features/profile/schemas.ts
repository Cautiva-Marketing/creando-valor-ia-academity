import { z } from 'zod';

/**
 * updateProfile (contracts/server-actions.md):
 * - data-model.md `profiles.full_name`: 1–80 characters, not only spaces.
 * - data-model.md `profiles.timezone`: only the format is checked here (1–64, `^[A-Za-z0-9_+\-/]+$`);
 *   the database is the authority (`pg_timezone_names`, error 22023).
 */
export const updateProfileSchema = z.object({
  fullName: z
    .string({ error: 'Escribe tu nombre.' })
    .trim()
    .min(1, { error: 'Escribe tu nombre.' })
    .max(80, { error: 'Tu nombre puede tener hasta 80 caracteres.' }),
  timezone: z
    .string({ error: 'Elige tu zona horaria.' })
    .trim()
    .min(1, { error: 'Elige tu zona horaria.' })
    .max(64, { error: 'Elige una zona horaria de la lista.' })
    .regex(/^[A-Za-z0-9_+\-/]+$/, { error: 'Elige una zona horaria de la lista.' }),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
