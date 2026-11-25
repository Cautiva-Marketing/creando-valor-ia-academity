import { CalendarX2, MessagesSquare } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { EvaluationFailed } from '@/features/practice/components/evaluation-failed';
import { EvaluationNotApplicable } from '@/features/practice/components/evaluation-not-applicable';
import { EvaluationProgress } from '@/features/practice/components/evaluation-progress';
import { PreScreen } from '@/features/practice/components/pre-screen';
import { ResultView } from '@/features/practice/components/result/result-view';
import { Transcript } from '@/features/practice/components/result/transcript';
import { SessionView } from '@/features/practice/components/session-view';
import { END_REASON_LABELS } from '@/features/practice/domain/labels';
import {
  getActiveSessionView,
  getFinishedSessionView,
  getQuotaStatus,
  getResultView,
  getSessionView,
} from '@/features/practice/queries';

export const metadata: Metadata = { title: 'Práctica' };

/**
 * Practice view by state (contracts/routes.md): configured → pre-screen; expired or discarded →
 * message + "Configurar otra"; active → chat (US4); finalized → evaluation progress, failed,
 * unavailable or not applicable, with the transcript (T155); evaluated → full result (T169).
 */
export default async function PracticePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSessionView(id);

  if (session.status === 'discarded' || session.expired) {
    return (
      <EmptyState
        icon={CalendarX2}
        title="Esta configuración ya no está disponible"
        description="Las prácticas configuradas vencen a las 24 horas o cuando preparas otra. No se consumió ninguna simulación."
        action={
          <Link href="/practicar" className={buttonVariants({ variant: 'primary' })}>
            Configurar otra
          </Link>
        }
      />
    );
  }

  if (session.status === 'configured') {
    const quota = await getQuotaStatus();
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl">Tu práctica está lista</h1>
          <p className="text-text-muted">
            Revisa a tu cliente y comienza cuando quieras: al comenzar se usa una simulación y
            tienes 20 minutos.
          </p>
        </div>
        <PreScreen session={session} quota={quota} />
      </div>
    );
  }

  if (session.status === 'active' && session.buyer) {
    const view = await getActiveSessionView(id);
    return <SessionView key={`${view.session.id}:${view.messages.length}`} view={view} />;
  }

  if (session.status === 'evaluated' && session.buyer) {
    const result = await getResultView(id);
    return (
      <div className="flex flex-col gap-6" data-testid="practice-finished" data-status="evaluated">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl">Tu resultado con {session.buyer.name}</h1>
          <p className="text-text-muted">{session.productName}</p>
        </div>
        <ResultView data={result} />
      </div>
    );
  }

  if (session.status === 'finalized' && session.buyer) {
    const finished = await getFinishedSessionView(id);
    const status = session.evaluationStatus;
    return (
      <div className="flex flex-col gap-6" data-testid="practice-finished" data-status="finalized">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl">Práctica con {session.buyer.name}</h1>
          <p className="text-text-muted">
            {session.productName}
            {session.endReason ? ` · ${END_REASON_LABELS[session.endReason]}` : ''}
          </p>
        </div>
        {status === 'pending' || status === 'in_progress' ? (
          <EvaluationProgress sessionId={session.id} initialPhase={session.evaluationPhase} />
        ) : status === 'failed' || status === 'unavailable' ? (
          <EvaluationFailed
            sessionId={session.id}
            manualRetriesLeft={session.manualRetriesLeft}
            unavailable={status === 'unavailable'}
          />
        ) : status === 'not_applicable' ? (
          <EvaluationNotApplicable />
        ) : null}
        <Transcript messages={finished.messages} buyerName={session.buyer.name} />
      </div>
    );
  }

  return (
    <EmptyState
      icon={MessagesSquare}
      title={session.status === 'active' ? 'Tu práctica está en curso' : 'Práctica terminada'}
      description={
        session.buyer
          ? `Conversación con ${session.buyer.name} sobre ${session.productName}.`
          : undefined
      }
      data-testid="practice-status"
      data-status={session.status}
    />
  );
}
