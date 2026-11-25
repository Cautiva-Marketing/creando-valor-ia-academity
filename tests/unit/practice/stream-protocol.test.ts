import { describe, expect, it } from 'vitest';
import {
  encodeEvent,
  NDJSON_HEADERS,
  toPublicState,
  type TurnStreamEvent,
} from '@/features/practice/stream/protocol';

/** T096 — event types of contracts/route-handlers.md; `state` without undiscovered secrets. */

const RAW = {
  interest: 62,
  mood: 'interested',
  lastDelta: 8,
  sellerMessageCount: 7,
  messagesLeft: 13,
  deadlineAt: '2026-11-24T15:20:00Z',
  reveals: [
    { kind: 'revealable', key: 'budget', value: 'S/ 45 000 – S/ 50 000', messageSeq: 12 },
    { kind: 'hidden_objection', key: 'h1', value: 'Mi esposo decide.', messageSeq: 14 },
  ],
  turnInProgress: false,
  hintAvailable: true,
};

describe('stream protocol', () => {
  it('maps the SQL state to the public state with labels', () => {
    expect(toPublicState(RAW)).toEqual({
      interest: 62,
      mood: 'interested',
      lastDelta: 8,
      sellerMessageCount: 7,
      messagesLeft: 13,
      deadlineAt: '2026-11-24T15:20:00Z',
      reveals: [
        {
          kind: 'revealable',
          key: 'budget',
          label: 'Presupuesto',
          value: 'S/ 45 000 – S/ 50 000',
          messageSeq: 12,
        },
        {
          kind: 'hidden_objection',
          key: 'h1',
          label: 'Objeción descubierta',
          value: 'Mi esposo decide.',
          messageSeq: 14,
        },
      ],
      turnInProgress: false,
      hintAvailable: true,
    });
  });

  it('only whitelisted fields reach the public state', () => {
    const state = toPublicState({
      ...RAW,
      revealables: [{ key: 'timeline', value: 'Secreto' }],
      motivation: 'Secreto',
      hiddenObjections: [{ id: 'h2', text: 'Secreto' }],
    });
    expect(JSON.stringify(state)).not.toContain('Secreto');
    expect(Object.keys(state).sort()).toEqual(
      [
        'deadlineAt',
        'hintAvailable',
        'interest',
        'lastDelta',
        'messagesLeft',
        'mood',
        'reveals',
        'sellerMessageCount',
        'turnInProgress',
      ].sort(),
    );
  });

  it('encodes one event per line', () => {
    const events: TurnStreamEvent[] = [
      { type: 'ack', sellerMessage: { seq: 2, id: 'm2', content: 'Hola', createdAt: 'x' } },
      { type: 'retrying', attempt: 2, waitMs: 1000 },
      { type: 'delta', text: 'Ho' },
      { type: 'reset' },
      { type: 'ended', endReason: 'goal_achieved', evaluationStatus: 'pending' },
      { type: 'error', code: 'ai_unavailable', message: 'x', retryable: true },
    ];
    const body = events.map(encodeEvent).join('');
    expect(
      body
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line)),
    ).toEqual(events);
    expect(encodeEvent({ type: 'reset' }).endsWith('\n')).toBe(true);
  });

  it('declares NDJSON without cache', () => {
    expect(NDJSON_HEADERS['Content-Type']).toContain('application/x-ndjson');
    expect(NDJSON_HEADERS['Cache-Control']).toBe('no-store');
  });
});
