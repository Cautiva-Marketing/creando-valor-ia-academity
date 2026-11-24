'use server';

import { revalidatePath } from 'next/cache';
import { fail, fromPostgresError, ok, unexpected, type ActionResult } from '@/lib/action-result';
import { actionRequireSuperadmin } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { fieldErrorsOf, formValues } from '@/features/auth/schemas';
import {
  reactivateOrganizationSchema,
  suspendOrganizationSchema,
  updateQuotaSchema,
} from './schemas';

/** Organization Server Actions (contracts/server-actions.md): guard S2 → Zod → RPC → revalidate. */

const LIST_PATH = '/admin/organizaciones';

export async function updateQuota(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const auth = await actionRequireSuperadmin();
  if (!auth.ok) return auth;
  const raw = formValues(formData, ['organizationId', 'dailyLimit', 'monthlyLimit']);
  const values = { dailyLimit: raw.dailyLimit ?? '', monthlyLimit: raw.monthlyLimit ?? '' };
  const parsed = updateQuotaSchema.safeParse(raw);
  if (!parsed.success)
    return fail('validation', { fieldErrors: fieldErrorsOf(parsed.error), values });

  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc('admin_update_quota', {
      p_org: parsed.data.organizationId,
      p_daily: parsed.data.dailyLimit,
      p_monthly: parsed.data.monthlyLimit,
    });
    if (error) return { ...fromPostgresError(error, 'updateQuota'), values };
    revalidatePath(LIST_PATH);
    return ok();
  } catch (error) {
    return { ...unexpected(error, 'updateQuota'), values };
  }
}

export async function suspendOrganization(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const auth = await actionRequireSuperadmin();
  if (!auth.ok) return auth;
  const raw = formValues(formData, ['organizationId', 'reason']);
  const values = { reason: raw.reason ?? '' };
  const parsed = suspendOrganizationSchema.safeParse(raw);
  if (!parsed.success)
    return fail('validation', { fieldErrors: fieldErrorsOf(parsed.error), values });

  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc('admin_set_organization_status', {
      p_org: parsed.data.organizationId,
      p_status: 'suspended',
      p_reason: parsed.data.reason,
    });
    if (error) {
      if (error.code === 'P0010')
        return fail('conflict', { message: 'La organización ya está suspendida.' });
      return { ...fromPostgresError(error, 'suspendOrganization'), values };
    }
    revalidatePath(LIST_PATH);
    return ok();
  } catch (error) {
    return { ...unexpected(error, 'suspendOrganization'), values };
  }
}

export async function reactivateOrganization(input: {
  organizationId: string;
}): Promise<ActionResult> {
  const auth = await actionRequireSuperadmin();
  if (!auth.ok) return auth;
  const parsed = reactivateOrganizationSchema.safeParse(input);
  if (!parsed.success) return fail('validation', { fieldErrors: fieldErrorsOf(parsed.error) });

  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc('admin_set_organization_status', {
      p_org: parsed.data.organizationId,
      p_status: 'active',
    });
    if (error) {
      if (error.code === 'P0010')
        return fail('conflict', { message: 'La organización ya está activa.' });
      return fromPostgresError(error, 'reactivateOrganization');
    }
    revalidatePath(LIST_PATH);
    return ok();
  } catch (error) {
    return unexpected(error, 'reactivateOrganization');
  }
}
