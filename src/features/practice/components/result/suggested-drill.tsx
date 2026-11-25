'use client';

import { Repeat } from 'lucide-react';
import Link from 'next/link';
import { useActionState, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FormAlert } from '@/components/ui/form-alert';
import { practiceAgain } from '../../actions';
import { cautivaLabel, type CautivaStage } from '../../domain/cautiva';

/**
 * Suggested drill + "Practicar de nuevo" (T166; FR-048): same configuration with the suggested stage
 * as focus. The idempotency key makes a double submit land on the same new practice.
 */
export function SuggestedDrill({
  sessionId,
  text,
  stage,
}: {
  sessionId: string;
  text: string;
  stage: CautivaStage | null;
}) {
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [state, action, pending] = useActionState(practiceAgain, null);
  const failure = state && !state.ok ? state : null;
  return (
    <section
      aria-labelledby="suggested-drill-title"
      data-testid="suggested-drill"
      className="flex flex-col gap-3 rounded-lg border border-accent bg-surface-raised p-4"
    >
      <div className="flex flex-col gap-1">
        <h2 id="suggested-drill-title" className="text-xl">
          Práctica sugerida
        </h2>
        {stage ? (
          <p>
            <Badge variant="accent">Etapa: {cautivaLabel(stage)}</Badge>
          </p>
        ) : null}
      </div>
      <p>{text}</p>
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
      <form action={action}>
        <input type="hidden" name="sessionId" value={sessionId} />
        <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
        <Button type="submit" loading={pending} loadingLabel="Preparando tu práctica…">
          <Repeat aria-hidden="true" />
          Practicar de nuevo
        </Button>
      </form>
    </section>
  );
}
