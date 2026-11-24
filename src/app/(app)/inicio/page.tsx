import { Sparkles } from 'lucide-react';
import type { Metadata } from 'next';
import { EmptyState } from '@/components/ui/empty-state';
import { ResumeOnboardingCard } from '@/features/onboarding/components/resume-onboarding-card';
import { personalOrganization } from '@/lib/auth/context-types';
import { requireOperativeUser } from '@/lib/auth/guards';

export const metadata: Metadata = { title: 'Inicio' };

/** Seller home: greeting, "La práctica llega pronto" and resume onboarding if skipped/in progress. */
export default async function HomePage() {
  const ctx = await requireOperativeUser('/inicio');
  const firstName = ctx.full_name?.trim().split(/\s+/)[0];
  const canResume =
    Boolean(personalOrganization(ctx)) &&
    (ctx.onboarding_status === 'skipped' || ctx.onboarding_status === 'in_progress');

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl">{firstName ? `Hola, ${firstName}` : 'Hola'}</h1>
      {canResume ? <ResumeOnboardingCard step={ctx.onboarding_step} /> : null}
      <EmptyState
        icon={Sparkles}
        title="La práctica llega pronto"
        description="Muy pronto podrás practicar tus conversaciones de venta con compradores simulados por IA."
      />
    </div>
  );
}
