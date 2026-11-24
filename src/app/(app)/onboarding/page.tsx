import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { OnboardingStepper } from '@/features/onboarding/components/onboarding-stepper';
import { isSuperadminAal2, personalOrganization } from '@/lib/auth/context-types';
import { requireOperativeUser } from '@/lib/auth/guards';

export const metadata: Metadata = { title: 'Bienvenida' };
export const dynamic = 'force-dynamic';

/** Seller onboarding (H8, FR-034): resumes on `profiles.onboarding_step`. */
export default async function OnboardingPage() {
  const ctx = await requireOperativeUser('/onboarding');
  if (!personalOrganization(ctx)) redirect(isSuperadminAal2(ctx) ? '/admin' : '/inicio');
  const firstName = ctx.full_name?.trim().split(/\s+/)[0];
  return <OnboardingStepper initialStep={ctx.onboarding_step} firstName={firstName} />;
}
