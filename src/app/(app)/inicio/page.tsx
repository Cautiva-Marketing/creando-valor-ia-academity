import { MessagesSquare, Package } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { CautivaStrip } from '@/components/ui/cautiva-strip';
import { ResumeOnboardingCard } from '@/features/onboarding/components/resume-onboarding-card';
import { OngoingPracticeCard } from '@/features/practice/components/ongoing-practice-card';
import { blockedReason } from '@/features/practice/components/quota-blocked';
import { QuotaSummary } from '@/features/practice/components/quota-summary';
import { Greeting } from '@/features/today/components/greeting';
import { GuidedSteps } from '@/features/today/components/guided-steps';
import { LastResultCard } from '@/features/today/components/last-result-card';
import { NextActionCard } from '@/features/today/components/next-action-card';
import { getToday } from '@/features/today/queries';
import { personalOrganization } from '@/lib/auth/context-types';
import { requireOperativeUser } from '@/lib/auth/guards';
import { isSeller } from '@/lib/auth/seller';

export const metadata: Metadata = { title: 'Hoy' };

/**
 * "Hoy" (US9; contracts/routes.md; FR-051, FR-052): (1) practice in progress or configured, (2)
 * recommended action (guided steps before the first evaluation), (3) last result with trend, (4)
 * C.A.U.T.I.V.A.™ strip of the last 5 evaluated, (5) quota or the reason it is blocked, (6) quick
 * links. Keeps the 001 "Retomar onboarding" card.
 */
export default async function TodayPage() {
  const ctx = await requireOperativeUser('/inicio');
  const firstName = ctx.full_name?.trim().split(/\s+/)[0] ?? null;
  const canResume =
    Boolean(personalOrganization(ctx)) &&
    (ctx.onboarding_status === 'skipped' || ctx.onboarding_status === 'in_progress');

  if (!isSeller(ctx)) {
    return (
      <div className="flex flex-col gap-6">
        <Greeting firstName={firstName} timezone={ctx.timezone} />
        {canResume ? <ResumeOnboardingCard step={ctx.onboarding_step} /> : null}
      </div>
    );
  }

  const today = await getToday(ctx.user_id);
  const reason = blockedReason(today.quota, ctx.timezone);

  return (
    <div className="flex flex-col gap-6">
      <Greeting firstName={firstName} timezone={ctx.timezone} />
      {canResume ? <ResumeOnboardingCard step={ctx.onboarding_step} /> : null}
      {today.current ? (
        <OngoingPracticeCard practice={today.current} timezone={ctx.timezone} />
      ) : null}
      <NextActionCard action={today.next} blockedReason={reason} />
      {today.steps ? <GuidedSteps steps={today.steps} /> : null}
      {today.lastResult ? (
        <LastResultCard result={today.lastResult} timezone={ctx.timezone} />
      ) : null}
      {today.lastResult ? (
        <CautivaStrip
          stages={today.stages}
          description="Promedio de tus últimas 5 prácticas evaluadas."
        />
      ) : null}
      {reason ? null : <QuotaSummary quota={today.quota} />}
      <nav aria-label="Accesos rápidos" className="flex flex-wrap gap-3">
        <Link href="/practicar" className={buttonVariants({ variant: 'secondary' })}>
          <MessagesSquare aria-hidden="true" />
          Practicar
        </Link>
        <Link href="/productos" className={buttonVariants({ variant: 'secondary' })}>
          <Package aria-hidden="true" />
          Mis productos
        </Link>
      </nav>
    </div>
  );
}
