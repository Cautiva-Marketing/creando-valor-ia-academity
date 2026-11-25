'use client';

import { Lock, Play } from 'lucide-react';
import Link from 'next/link';
import { startTransition, useActionState, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FormAlert } from '@/components/ui/form-alert';
import type { ActionResult } from '@/lib/action-result';
import { startPractice } from '../actions';
import { cautivaLabel } from '../domain/cautiva';
import { difficultyFor, type DifficultyLevel } from '../domain/difficulty';
import { OBJECTION_CATEGORY_LABELS, REVEALABLE_LABELS } from '../domain/labels';
import type { QuotaStatus, SessionView } from '../queries';
import { AiNotice } from './ai-notice';
import { QuotaSummary } from './quota-summary';

/**
 * Pre-screen of a configured practice (FR-014): public persona, visible objection, goal, options and
 * remaining quota. Never the hidden objection, the motivation or revealable values: only their
 * labels, locked. "Comenzar" consumes one simulation (FR-018) and is disabled after the first click.
 */
export function PreScreen({
  session,
  quota,
}: {
  session: SessionView;
  quota: Pick<QuotaStatus, 'remainingToday' | 'remainingMonth'>;
}) {
  const [clicked, setClicked] = useState(false);
  const [state, action, pending] = useActionState(
    async (prev: ActionResult<{ sessionId: string }> | null, formData: FormData) => {
      const result = await startPractice(prev, formData);
      if (!result.ok) setClicked(false);
      return result;
    },
    null,
  );
  const failure = state && !state.ok ? state : null;
  const busy = pending || clicked;
  const buyer = session.buyer;
  const difficulty = difficultyFor(session.difficulty as DifficultyLevel);

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <p className="text-sm font-medium text-text-muted">Tu cliente</p>
          <CardTitle className="text-2xl" data-testid="buyer-name">
            {buyer ? `${buyer.name}, ${buyer.age} años` : 'Cliente'}
          </CardTitle>
          {buyer ? <p className="text-text-muted">{buyer.occupation}</p> : null}
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {buyer ? <p>{buyer.intro}</p> : null}

          <dl className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <dt className="text-sm font-semibold text-text-muted">Objeción que plantea</dt>
              <dd data-testid="visible-objection">
                {session.visibleObjection}
                {session.visibleObjectionCategory ? (
                  <Badge className="ml-2">
                    {OBJECTION_CATEGORY_LABELS[session.visibleObjectionCategory]}
                  </Badge>
                ) : null}
              </dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="text-sm font-semibold text-text-muted">Tu meta</dt>
              <dd data-testid="buyer-goal">{buyer?.goal}</dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="text-sm font-semibold text-text-muted">Dificultad</dt>
              <dd>
                {difficulty.level} · {difficulty.name}
                <span className="block text-sm text-text-muted">{difficulty.description}</span>
              </dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="text-sm font-semibold text-text-muted">Pistas</dt>
              <dd>{session.hintsEnabled ? 'Activadas' : 'Desactivadas'}</dd>
            </div>
            {session.focusStage ? (
              <div className="flex flex-col gap-1">
                <dt className="text-sm font-semibold text-text-muted">Etapa foco</dt>
                <dd>{cautivaLabel(session.focusStage)}</dd>
              </div>
            ) : null}
            <div className="flex flex-col gap-1">
              <dt className="text-sm font-semibold text-text-muted">Producto</dt>
              <dd>
                {session.productName}{' '}
                <span className="text-sm text-text-muted">(versión {session.productVersion})</span>
              </dd>
            </div>
          </dl>

          <section aria-labelledby="revelables-titulo" className="flex flex-col gap-2">
            <h2 id="revelables-titulo" className="text-base font-semibold">
              Datos por descubrir
            </h2>
            <p className="text-sm text-text-muted">
              Se desbloquean durante la conversación si haces las preguntas adecuadas.
            </p>
            <ul className="flex flex-wrap gap-2" aria-label="Datos bloqueados">
              {(buyer?.revealableLabels ?? []).map((key) => (
                <li key={key}>
                  <Badge>
                    <Lock aria-hidden="true" />
                    {REVEALABLE_LABELS[key]}
                    <span className="sr-only"> (bloqueado)</span>
                  </Badge>
                </li>
              ))}
            </ul>
          </section>
        </CardContent>
      </Card>

      <AiNotice variant="session" />
      <QuotaSummary quota={quota} />

      {failure ? (
        <FormAlert>
          <span>{failure.message}</span>
          {failure.code === 'active_session' && failure.details?.sessionId ? (
            <>
              {' '}
              <Link
                href={`/practicas/${failure.details.sessionId}`}
                className="font-semibold text-primary underline underline-offset-4"
              >
                Retomar la práctica
              </Link>
            </>
          ) : null}
        </FormAlert>
      ) : null}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (busy) return;
          setClicked(true);
          const formData = new FormData(event.currentTarget);
          startTransition(() => action(formData));
        }}
        className="flex flex-col gap-3 sm:flex-row"
      >
        <input type="hidden" name="sessionId" value={session.id} />
        <Button type="submit" size="lg" disabled={busy} aria-busy={busy || undefined}>
          <Play aria-hidden="true" />
          {busy ? 'Comenzando…' : 'Comenzar'}
        </Button>
        <Link
          href="/practicar"
          className="inline-flex min-h-touch items-center justify-center px-2 font-medium text-primary underline-offset-4 hover:underline"
        >
          Configurar otra
        </Link>
      </form>
    </div>
  );
}
