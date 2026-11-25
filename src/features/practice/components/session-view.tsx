'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FormAlert } from '@/components/ui/form-alert';
import { selectIdeas } from '../hints/select';
import { hintStateFrom } from '../hints/state';
import type { ActiveSessionView } from '../queries';
import { AiNotice } from './ai-notice';
import { ChatView } from './chat/chat-view';
import { Composer, COMPOSER_ID } from './chat/composer';
import { loadDraft, saveDraft } from './chat/draft';
import { useTurnStream } from './chat/use-turn-stream';
import { FinishDialog } from './finish-dialog';
import { HintButton } from './hint-button';
import { IdeaChips } from './idea-chips';
import { PanelAnnouncer } from './panel/panel-announcer';
import { SessionPanel, SessionSummaryBar, type PanelInfo } from './panel/session-panel';

/**
 * Active practice (T124; US4): chat + panel + composer + AI notice. The transcript, the panel and the
 * draft survive a closed tab: the server view rebuilds them and the draft comes from localStorage.
 */
export function SessionView({ view }: { view: ActiveSessionView }) {
  const router = useRouter();
  const { session } = view;
  const buyer = session.buyer!;
  const { stream, send, retry } = useTurnStream({
    sessionId: session.id,
    buyerName: buyer.name,
    initialMessages: view.messages,
    initialState: view.state,
    unanswered: view.unanswered,
  });
  const [draft, setDraft] = useState('');

  useEffect(() => {
    // The stored draft is read after hydration (storage does not exist on the server).
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time restore from storage
    setDraft(loadDraft(session.id));
  }, [session.id]);

  const changeDraft = useCallback(
    (value: string) => {
      setDraft(value);
      saveDraft(session.id, value);
    },
    [session.id],
  );

  const busy = stream.phase !== 'idle';
  const ended = stream.ended != null;
  const state = stream.state;
  const ideas = useMemo(
    () =>
      session.hintsEnabled
        ? selectIdeas(
            hintStateFrom({
              state,
              focusStage: session.focusStage,
              revealableLabels: buyer.revealableLabels,
              selectedObjectionCount: view.selectedObjectionCount,
            }),
          )
        : [],
    [
      buyer.revealableLabels,
      session.focusStage,
      session.hintsEnabled,
      state,
      view.selectedObjectionCount,
    ],
  );

  const pick = (text: string) => {
    changeDraft(draft.trim() ? `${draft.trimEnd()} ${text}` : text);
    document.getElementById(COMPOSER_ID)?.focus();
  };

  const timeUp = useCallback(() => router.refresh(), [router]);
  const panelInfo: PanelInfo = {
    visibleObjection: session.visibleObjection,
    visibleObjectionCategory: session.visibleObjectionCategory,
    goal: buyer.goal,
    focusStage: session.focusStage,
    revealableLabels: buyer.revealableLabels,
  };
  const outOfMessages = state.messagesLeft === 0;

  return (
    <div className="grid gap-6 lg:grid-cols-3" data-testid="practice-session">
      <div className="flex flex-col gap-4 lg:col-span-2">
        <header className="flex flex-col gap-1">
          <h1 className="text-2xl">
            {buyer.name}, {buyer.age} años
          </h1>
          <p className="text-text-muted">
            {buyer.occupation} · {session.productName}
          </p>
        </header>
        <AiNotice variant="session" compact />

        <div className="lg:hidden">
          <SessionSummaryBar info={panelInfo} state={state} />
        </div>
        <PanelAnnouncer state={state} onTimeUp={timeUp} />

        <ChatView
          messages={stream.messages}
          buyerName={buyer.name}
          phase={stream.phase}
          streamingText={stream.streamingText}
          announcement={stream.announcement}
          reveals={state.reveals}
          onRetry={retry}
        />

        {stream.notice ? <FormAlert tone="info">{stream.notice}</FormAlert> : null}
        {ended ? (
          <FormAlert tone="info" title="La práctica terminó">
            Estamos preparando tu evaluación.
          </FormAlert>
        ) : (
          <>
            {session.hintsEnabled ? (
              <div className="flex flex-col gap-3">
                <HintButton
                  sessionId={session.id}
                  available={state.hintAvailable}
                  turn={state.sellerMessageCount}
                />
                <IdeaChips ideas={ideas} onPick={pick} />
              </div>
            ) : null}
            <Composer
              value={draft}
              onChange={changeDraft}
              onSend={(text) => {
                send(text);
                changeDraft('');
              }}
              disabled={busy || outOfMessages}
              disabledReason={
                outOfMessages
                  ? 'Ya enviaste los 20 mensajes de esta práctica.'
                  : 'Espera la respuesta del cliente.'
              }
            />
            <FinishDialog
              sessionId={session.id}
              sellerMessageCount={state.sellerMessageCount}
              turnInProgress={busy}
              className="items-start"
            />
          </>
        )}
      </div>

      <div className="hidden lg:block">
        <SessionPanel info={panelInfo} state={state} />
      </div>
    </div>
  );
}
