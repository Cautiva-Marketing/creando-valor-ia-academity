'use server';

import { revalidatePath } from 'next/cache';
import { fail, fromPostgresError, ok, unexpected, type ActionResult } from '@/lib/action-result';
import { actionRequireOperativeUser } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { fieldErrorsOf, formValues } from '@/features/auth/schemas';
import { updateProfileSchema } from './schemas';

/**
 * updateProfile (contracts/server-actions.md): operative user (or superadmin aal2) → Zod →
 * rpc update_my_profile with the user client; 22023 → error on the time zone field; refreshes the
 * whole layout so the avatar and dates follow the change.
 */
export async function updateProfile(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const auth = await actionRequireOperativeUser();
  if (!auth.ok) return auth;
  const raw = formValues(formData, ['fullName', 'timezone']);
  const values = { fullName: raw.fullName ?? '', timezone: raw.timezone ?? '' };
  const parsed = updateProfileSchema.safeParse(raw);
  if (!parsed.success)
    return fail('validation', { fieldErrors: fieldErrorsOf(parsed.error), values });

  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc('update_my_profile', {
      p_full_name: parsed.data.fullName,
      p_timezone: parsed.data.timezone,
    });
    if (error) {
      if (error.code === '22023') {
        return fail('validation', {
          fieldErrors: { timezone: ['Elige una zona horaria de la lista.'] },
          values,
        });
      }
      if (error.code === '23514') {
        return fail('validation', {
          fieldErrors: { fullName: ['Revisa tu nombre (1 a 80 caracteres).'] },
          values,
        });
      }
      if (error.code === '42501') return { ...fail('suspended'), values };
      return { ...fromPostgresError(error, 'updateProfile'), values };
    }
    revalidatePath('/', 'layout');
    return ok();
  } catch (error) {
    return { ...unexpected(error, 'updateProfile'), values };
  }
}
