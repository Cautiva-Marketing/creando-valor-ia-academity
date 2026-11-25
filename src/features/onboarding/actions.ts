'use server';

import { redirect } from 'next/navigation';
import { fail, ok, unexpected, type ActionResult } from '@/lib/action-result';
import { personalOrganization, type RequestContext } from '@/lib/auth/context-types';
import { actionRequireOrgMember } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/supabase/database.types';
import { fieldErrorsOf } from '@/features/auth/schemas';
import { onboardingStepSchema } from './schemas';

/**
 * Onboarding actions (contracts/server-actions.md): guard = seller of their personal organization;
 * persist data-model.md `profiles.onboarding_status` / `profiles.onboarding_step` (column GRANT + RLS
 * on the user's own row).
 */

type OnboardingStatus = Database['public']['Enums']['onboarding_status'];

const guard = () =>
  actionRequireOrgMember((ctx) => personalOrganization(ctx)?.organization_id, ['vendedor']);

async function save(
  ctx: RequestContext,
  values: { onboarding_status?: OnboardingStatus; onboarding_step?: number },
) {
  const supabase = await createClient();
  const { error } = await supabase.from('profiles').update(values).eq('user_id', ctx.user_id);
  if (error) throw new Error(`onboarding update failed (${error.code})`);
}

export async function setOnboardingStep(input: { step: number }): Promise<ActionResult> {
  const auth = await guard();
  if (!auth.ok) return auth;
  const parsed = onboardingStepSchema.safeParse(input);
  if (!parsed.success) return fail('validation', { fieldErrors: fieldErrorsOf(parsed.error) });
  try {
    await save(auth.ctx, { onboarding_status: 'in_progress', onboarding_step: parsed.data.step });
    return ok();
  } catch (error) {
    return unexpected(error, 'setOnboardingStep');
  }
}

export async function skipOnboarding(): Promise<ActionResult> {
  const auth = await guard();
  if (!auth.ok) return auth;
  try {
    await save(auth.ctx, { onboarding_status: 'skipped' });
  } catch (error) {
    return unexpected(error, 'skipOnboarding');
  }
  redirect('/inicio');
}

/** Finishes on the suggested first step: registering a product (FR-053). */
export async function completeOnboarding(): Promise<ActionResult> {
  const auth = await guard();
  if (!auth.ok) return auth;
  try {
    await save(auth.ctx, { onboarding_status: 'completed', onboarding_step: 3 });
  } catch (error) {
    return unexpected(error, 'completeOnboarding');
  }
  redirect('/productos/nuevo');
}

/** Reopens the onboarding at the step reached (from the start once completed). */
export async function resumeOnboarding(): Promise<ActionResult> {
  const auth = await guard();
  if (!auth.ok) return auth;
  try {
    await save(
      auth.ctx,
      auth.ctx.onboarding_status === 'completed'
        ? { onboarding_status: 'in_progress', onboarding_step: 1 }
        : { onboarding_status: 'in_progress' },
    );
  } catch (error) {
    return unexpected(error, 'resumeOnboarding');
  }
  redirect('/onboarding');
}
