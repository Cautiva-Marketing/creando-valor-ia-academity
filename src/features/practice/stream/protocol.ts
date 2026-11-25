import { REVEALABLE_LABELS } from '../domain/labels';
import { moodFor, type Mood } from '../domain/mood';

/**
 * NDJSON protocol of POST /api/practicas/[id]/turnos (contracts/route-handlers.md). Shared by the
 * route (server) and the stream reader (browser). `state` only carries discovered data: reveal values
 * are copies made when they were discovered; secrets never reach it.
 */
export type RevealKind = 'revealable' | 'hidden_objection';

export interface PublicReveal {
  kind: RevealKind;
  key: string;
  label: string;
  value: string;
  messageSeq: number;
}

export interface PublicState {
  interest: number;
  mood: Mood;
  lastDelta: number | null;
  sellerMessageCount: number;
  messagesLeft: number;
  deadlineAt: string;
  reveals: PublicReveal[];
  turnInProgress: boolean;
  hintAvailable: boolean;
}

export interface StreamMessage {
  seq: number;
  id: string;
  content: string;
  createdAt: string;
}

export type EndReason =
  'goal_achieved' | 'buyer_abandoned' | 'message_limit' | 'time_limit' | 'seller_ended';

export type EvaluationStatus =
  'not_applicable' | 'pending' | 'running' | 'completed' | 'failed' | 'unavailable';

export type TurnStreamEvent =
  | { type: 'ack'; sellerMessage: StreamMessage }
  | { type: 'retrying'; attempt: number; waitMs: number }
  | { type: 'delta'; text: string }
  | { type: 'reset' }
  | { type: 'turn'; buyerMessage: StreamMessage; state: PublicState }
  | { type: 'ended'; endReason: EndReason; evaluationStatus: EvaluationStatus | null }
  | {
      type: 'error';
      code: 'ai_unavailable' | 'unexpected';
      message: string;
      retryable: true;
      referenceId?: string;
    };

export const HIDDEN_OBJECTION_LABEL = 'Objeción descubierta';

export function revealLabel(kind: RevealKind, key: string): string {
  if (kind === 'hidden_objection') return HIDDEN_OBJECTION_LABEL;
  return REVEALABLE_LABELS[key as keyof typeof REVEALABLE_LABELS] ?? key;
}

export const messageAnchor = (seq: number) => `m${seq}`;

interface RawReveal {
  kind: RevealKind;
  key: string;
  value: string;
  messageSeq: number;
}

/** Maps `private.practice_public_state` (SQL jsonb) to the public state with labels (whitelist). */
export function toPublicState(raw: Record<string, unknown>): PublicState {
  const interest = Number(raw.interest ?? 0);
  const reveals = Array.isArray(raw.reveals) ? (raw.reveals as RawReveal[]) : [];
  return {
    interest,
    mood: moodFor(interest),
    lastDelta: raw.lastDelta == null ? null : Number(raw.lastDelta),
    sellerMessageCount: Number(raw.sellerMessageCount ?? 0),
    messagesLeft: Number(raw.messagesLeft ?? 0),
    deadlineAt: String(raw.deadlineAt ?? ''),
    reveals: reveals.map((r) => ({
      kind: r.kind,
      key: r.key,
      label: revealLabel(r.kind, r.key),
      value: r.value,
      messageSeq: Number(r.messageSeq),
    })),
    turnInProgress: Boolean(raw.turnInProgress),
    hintAvailable: Boolean(raw.hintAvailable),
  };
}

export function encodeEvent(event: TurnStreamEvent): string {
  return `${JSON.stringify(event)}\n`;
}

export const NDJSON_HEADERS = {
  'Content-Type': 'application/x-ndjson; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
} as const;
