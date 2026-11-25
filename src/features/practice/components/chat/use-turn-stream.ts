'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useRef, useState } from 'react';
import type { ChatMessage } from '../../queries';
import { readNdjson } from '../../stream/read-ndjson';
import type { EndReason, PublicState, TurnStreamEvent } from '../../stream/protocol';
import { saveDraft } from './draft';

/**
 * Client side of a turn (contracts/route-handlers.md): optimistic seller message, one
 * `clientMessageId` per message reused by "Reintentar" (SC-009), NDJSON events, network errors →
 * "no enviado" keeping the text, 401 → draft saved and sign in again with `next` back here.
 */
export interface UiMessage {
  key: string;
  seq: number | null;
  author: 'seller' | 'buyer';
  content: string;
  createdAt: string | null;
  status: 'sent' | 'sending' | 'failed';
  clientMessageId?: string;
  /** Why it failed (shown next to "Reintentar"). */
  error?: string;
}

export type TurnPhase = 'idle' | 'waiting' | 'retrying' | 'streaming';

export interface TurnStreamState {
  messages: UiMessage[];
  phase: TurnPhase;
  /** Provisional text of the buyer (not announced; replaced by the confirmed message). */
  streamingText: string;
  state: PublicState;
  ended: EndReason | null;
  /** Conflict or limit notice not tied to a message (e.g. "Espera la respuesta del cliente"). */
  notice: string | null;
  /** Last confirmed buyer message, announced once in the polite region. */
  announcement: string;
}

const NOT_SENT = 'No se envió. Revisa tu conexión y reintenta.';
const TURN_FAILED = 'El cliente no pudo responder. Reintenta tu mensaje.';

function fromServer(message: ChatMessage): UiMessage {
  return {
    key: `m${message.seq}`,
    seq: message.seq,
    author: message.author,
    content: message.content,
    createdAt: message.createdAt,
    status: 'sent',
  };
}

export function useTurnStream({
  sessionId,
  buyerName,
  initialMessages,
  initialState,
  unanswered,
}: {
  sessionId: string;
  buyerName: string;
  initialMessages: ChatMessage[];
  initialState: PublicState;
  unanswered: { seq: number; content: string; clientMessageId: string | null } | null;
}) {
  const router = useRouter();
  const [stream, setStream] = useState<TurnStreamState>(() => ({
    messages: initialMessages.map((m) => {
      const ui = fromServer(m);
      if (unanswered && m.seq === unanswered.seq) {
        return {
          ...ui,
          status: 'failed',
          clientMessageId: unanswered.clientMessageId ?? undefined,
          error: initialState.turnInProgress ? undefined : TURN_FAILED,
        };
      }
      return ui;
    }),
    phase: initialState.turnInProgress ? 'waiting' : 'idle',
    streamingText: '',
    state: initialState,
    ended: null,
    notice: null,
    announcement: '',
  }));
  const busy = useRef(false);

  const patchMessage = useCallback((key: string, patch: Partial<UiMessage>) => {
    setStream((s) => ({
      ...s,
      messages: s.messages.map((m) => (m.key === key ? { ...m, ...patch } : m)),
    }));
  }, []);

  const run = useCallback(
    async (key: string, text: string, clientMessageId: string) => {
      if (busy.current) return;
      busy.current = true;
      setStream((s) => ({ ...s, phase: 'waiting', streamingText: '', notice: null }));
      const fail = (error: string) => {
        patchMessage(key, { status: 'failed', error });
        setStream((s) => ({ ...s, phase: 'idle', streamingText: '' }));
      };

      let response: Response;
      try {
        response = await fetch(`/api/practicas/${sessionId}/turnos`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clientMessageId, text }),
        });
      } catch {
        busy.current = false;
        fail(NOT_SENT);
        return;
      }

      if (response.status === 401) {
        saveDraft(sessionId, text);
        router.push(`/iniciar-sesion?next=${encodeURIComponent(`/practicas/${sessionId}`)}`);
        return;
      }
      if (!response.ok || !response.body) {
        busy.current = false;
        const body = (await response.json().catch(() => null)) as {
          message?: string;
          details?: { reason?: string };
        } | null;
        const reason = body?.details?.reason;
        if (response.status === 409 && (reason === 'not_active' || reason === 'message_limit')) {
          setStream((s) => ({
            ...s,
            phase: 'idle',
            messages: s.messages.filter((m) => m.key !== key || m.seq !== null),
          }));
          saveDraft(sessionId, text);
          router.refresh();
          return;
        }
        if (response.status === 409 && reason === 'turn_in_progress') {
          setStream((s) => ({
            ...s,
            phase: 'idle',
            notice: 'Espera la respuesta del cliente antes de enviar otro mensaje.',
          }));
          patchMessage(key, { status: 'failed', error: 'Espera la respuesta del cliente.' });
          return;
        }
        fail(body?.message ?? NOT_SENT);
        return;
      }

      let ended: EndReason | null = null;
      let gotTurn = false;
      try {
        for await (const event of readNdjson<TurnStreamEvent>(response.body)) {
          switch (event.type) {
            case 'ack':
              setStream((s) => ({
                ...s,
                messages: s.messages
                  // a retry of a message the server already had: keep a single bubble
                  .filter((m) => m.key === key || m.seq !== event.sellerMessage.seq)
                  .map((m) =>
                    m.key === key
                      ? {
                          ...m,
                          seq: event.sellerMessage.seq,
                          content: event.sellerMessage.content,
                          createdAt: event.sellerMessage.createdAt,
                          status: 'sending',
                          error: undefined,
                        }
                      : m,
                  ),
              }));
              break;
            case 'retrying':
              setStream((s) => ({ ...s, phase: 'retrying' }));
              break;
            case 'delta':
              setStream((s) => ({
                ...s,
                phase: 'streaming',
                streamingText: s.streamingText + event.text,
              }));
              break;
            case 'reset':
              setStream((s) => ({ ...s, streamingText: '' }));
              break;
            case 'turn':
              gotTurn = true;
              setStream((s) => ({
                ...s,
                phase: 'idle',
                streamingText: '',
                state: event.state,
                announcement: `${buyerName}: ${event.buyerMessage.content}`,
                messages: [
                  ...s.messages.map((m) =>
                    m.key === key ? { ...m, status: 'sent' as const, error: undefined } : m,
                  ),
                  {
                    key: event.buyerMessage.id,
                    seq: event.buyerMessage.seq,
                    author: 'buyer',
                    content: event.buyerMessage.content,
                    createdAt: event.buyerMessage.createdAt,
                    status: 'sent',
                  },
                ],
              }));
              break;
            case 'ended':
              ended = event.endReason;
              setStream((s) => ({ ...s, ended: event.endReason }));
              break;
            case 'error':
              fail(event.message);
              break;
          }
        }
        if (!gotTurn) {
          setStream((s) => ({
            ...s,
            phase: 'idle',
            streamingText: '',
            messages: s.messages.map((m) =>
              m.key === key && m.status === 'sending'
                ? { ...m, status: 'failed', error: TURN_FAILED }
                : m,
            ),
          }));
        }
      } catch {
        fail(NOT_SENT);
      } finally {
        busy.current = false;
      }
      if (ended) router.refresh();
    },
    [buyerName, patchMessage, router, sessionId],
  );

  const send = useCallback(
    (text: string) => {
      // A second click before the first render settles must not create a second message.
      if (busy.current) return;
      const clientMessageId = crypto.randomUUID();
      const key = `local-${clientMessageId}`;
      setStream((s) => ({
        ...s,
        messages: [
          ...s.messages,
          {
            key,
            seq: null,
            author: 'seller',
            content: text,
            createdAt: null,
            status: 'sending',
            clientMessageId,
          },
        ],
      }));
      void run(key, text, clientMessageId);
    },
    [run],
  );

  const retry = useCallback(
    (key: string) => {
      const message = stream.messages.find((m) => m.key === key);
      if (!message) return;
      const clientMessageId = message.clientMessageId ?? crypto.randomUUID();
      patchMessage(key, { status: 'sending', error: undefined, clientMessageId });
      void run(key, message.content, clientMessageId);
    },
    [patchMessage, run, stream.messages],
  );

  return { stream, send, retry, setState: setStream };
}
