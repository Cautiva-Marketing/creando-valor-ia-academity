'use client';

import { CheckCircle2, Circle, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { Database } from '@/lib/supabase/database.types';
import { cn } from '@/lib/utils';

/**
 * Evaluation progress (T153; contracts/route-handlers.md → estado; FR-043): visible phases, polling of
 * GET /api/practicas/[id]/estado every 2 s only while the tab is visible, waiting `Retry-After` on a
 * 429 without showing an error, and `router.refresh()` when the state leaves pending/in_progress.
 * The seller may leave and come back: the evaluation runs in the background.
 */
type Phase = Database['public']['Enums']['evaluation_phase'];

export const EVALUATION_PHASES: ReadonlyArray<{ phase: Phase; label: string }> = [
  { phase: 'reading', label: 'Leyendo la conversación' },
  { phase: 'scoring', label: 'Evaluando criterios' },
  { phase: 'reporting', label: 'Preparando tu reporte' },
];

const POLL_MS = 2_000;

interface StatusBody {
  status: string;
  evaluationStatus: string | null;
  evaluationPhase: Phase | null;
}

export function EvaluationProgress({
  sessionId,
  initialPhase,
}: {
  sessionId: string;
  initialPhase: Phase | null;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase | null>(initialPhase);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const done = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const schedule = (ms: number) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(poll, ms);
    };

    async function poll() {
      if (cancelled || done.current) return;
      if (document.visibilityState !== 'visible') return; // resumed by visibilitychange
      try {
        const response = await fetch(`/api/practicas/${sessionId}/estado`, { cache: 'no-store' });
        if (cancelled) return;
        if (response.status === 429) {
          const wait = Number(response.headers.get('Retry-After'));
          schedule((Number.isFinite(wait) && wait > 0 ? wait : 2) * 1000);
          return;
        }
        if (response.ok) {
          const body = (await response.json()) as StatusBody;
          if (cancelled) return;
          const running =
            body.status === 'finalized' &&
            (body.evaluationStatus === 'pending' || body.evaluationStatus === 'in_progress');
          if (!running) {
            done.current = true;
            router.refresh();
            return;
          }
          setPhase(body.evaluationStatus === 'in_progress' ? body.evaluationPhase : null);
        } else if (response.status === 401 || response.status === 404) {
          done.current = true;
          router.refresh();
          return;
        }
      } catch {
        // Network hiccup: try again on the next tick.
      }
      schedule(POLL_MS);
    }

    const onVisibility = () => {
      if (document.visibilityState === 'visible') schedule(0);
    };
    document.addEventListener('visibilitychange', onVisibility);
    schedule(POLL_MS);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [sessionId, router]);

  const currentIndex = phase ? EVALUATION_PHASES.findIndex((p) => p.phase === phase) : -1;
  const current = currentIndex >= 0 ? EVALUATION_PHASES[currentIndex]!.label : 'En cola';

  return (
    <section
      aria-labelledby="evaluation-progress-title"
      data-testid="evaluation-progress"
      data-phase={phase ?? 'queued'}
      className="flex flex-col gap-4 rounded-lg border border-border bg-surface-raised p-4"
    >
      <div className="flex flex-col gap-1">
        <h2 id="evaluation-progress-title" className="text-xl">
          Estamos evaluando tu práctica
        </h2>
        <p className="text-text-muted">
          Toma menos de un minuto. Puedes salir de esta página: te esperamos con el resultado.
        </p>
      </div>
      <ol className="flex flex-col gap-2">
        {EVALUATION_PHASES.map((step, index) => {
          const state =
            index < currentIndex ? 'done' : index === currentIndex ? 'current' : 'upcoming';
          const Icon = state === 'done' ? CheckCircle2 : state === 'current' ? Loader2 : Circle;
          return (
            <li
              key={step.phase}
              data-state={state}
              aria-current={state === 'current' ? 'step' : undefined}
              className={cn(
                'flex items-center gap-2',
                state === 'upcoming' ? 'text-text-muted' : 'text-text',
                state === 'current' && 'font-semibold',
              )}
            >
              <Icon
                aria-hidden="true"
                className={cn(
                  'size-5 shrink-0',
                  state === 'done' && 'text-success',
                  state === 'current' && 'animate-spin text-primary motion-reduce:animate-none',
                )}
              />
              {step.label}
            </li>
          );
        })}
      </ol>
      <p role="status" aria-live="polite" className="sr-only" data-testid="evaluation-phase">
        {current}
      </p>
    </section>
  );
}
