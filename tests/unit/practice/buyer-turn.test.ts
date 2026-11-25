import { APICallError, simulateReadableStream } from 'ai';
import { MockLanguageModelV3 } from 'ai/test';
import { describe, expect, it } from 'vitest';
import type { TurnContextPayload } from '@/features/practice/ai/buyer-context';
import {
  runBuyerTurn,
  type BuyerTurnDeps,
  type BuyerTurnEvent,
  type BuyerTurnResult,
} from '@/features/practice/ai/buyer-turn';
import type { AiUsageInput } from '@/lib/ai/usage';

/** T095 (research.md §R4/§R5; FR-023, FR-024, FR-034, FR-058). */

const CONTEXT: TurnContextPayload = {
  session: {
    id: '00000000-0000-4000-9000-000000000c11',
    status: 'active',
    difficulty: 3,
    hintsEnabled: true,
    focusStage: null,
    interest: 45,
    sellerMessageCount: 5,
    lastSeq: 10,
    deadlineAt: '2026-11-24T15:20:00Z',
    turnLockSeq: 10,
    visibleObjection: 'No tengo tiempo para estudiar.',
    visibleObjectionCategory: 'time',
    organizationId: '00000000-0000-4000-b000-00000000000c',
    buyerPromptVersion: 'buyer@1.0.0',
  },
  buyer: {
    name: 'Lucía Ramos',
    age: 29,
    occupation: 'Asistente',
    intro: 'Trabaja en una distribuidora.',
    goal: 'Que se inscriba en la clase',
    motivation: 'Quiere un ascenso.',
    personality: 'Práctica.',
  },
  revealables: [
    { key: 'budget', value: 'Entre S/ 800 y S/ 1 200' },
    { key: 'timeline', value: 'Este mes' },
  ],
  hiddenObjections: [{ id: 'h1', text: 'La mensualidad está cara.', category: 'price' }],
  product: {
    sector: 'education',
    name: 'Curso de ventas',
    description: 'Curso de 8 semanas.',
    priceKind: 'fixed',
    priceMin: 1000,
    priceMax: 1000,
    benefits: ['Certificado'],
    differentiators: [],
    verifiableFacts: [],
  },
  messages: [
    { seq: 1, author: 'buyer', content: 'Hola, no sé si tengo tiempo.' },
    { seq: 2, author: 'seller', content: 'Hola Lucía, ¿qué buscas?' },
  ],
  reveals: [],
};

const META = {
  interest_delta: 5,
  revealed: [],
  hidden_objection_raised: null,
  seller_abusive: false,
  end: false,
  end_reason: null,
};

const json = (reply: string, meta: Record<string, unknown> = {}) =>
  JSON.stringify({ reply, meta: { ...META, ...meta } });

/** Splits a JSON text into chunks of `size` characters. */
const chunks = (text: string, size = 7) =>
  Array.from({ length: Math.ceil(text.length / size) }, (_, i) =>
    text.slice(i * size, (i + 1) * size),
  );

type Step = { text: string } | { status: number } | { text: string; failAfter: number };

function modelFrom(steps: Step[]) {
  const signals: Array<AbortSignal | undefined> = [];
  const prompts: string[] = [];
  let call = 0;
  const model = new MockLanguageModelV3({
    doStream: async (options) => {
      signals.push(options.abortSignal);
      prompts.push(JSON.stringify(options.prompt));
      const step = steps[Math.min(call++, steps.length - 1)]!;
      if ('status' in step) {
        throw new APICallError({
          message: `status ${step.status}`,
          url: 'mock://',
          requestBodyValues: {},
          statusCode: step.status,
        });
      }
      const parts = chunks(step.text);
      const failAfter = 'failAfter' in step ? step.failAfter : Infinity;
      const streamed = parts.slice(0, failAfter).map((delta) => ({
        type: 'text-delta' as const,
        id: 't',
        delta,
      }));
      const tail =
        failAfter < parts.length
          ? [{ type: 'error' as const, error: new Error('socket hang up') }]
          : [
              { type: 'text-end' as const, id: 't' },
              {
                type: 'finish' as const,
                finishReason: { unified: 'stop' as const, raw: 'stop' },
                usage: {
                  inputTokens: {
                    total: 120,
                    noCache: 120,
                    cacheRead: undefined,
                    cacheWrite: undefined,
                  },
                  outputTokens: { total: 30, text: 30, reasoning: undefined },
                },
              },
            ];
      return {
        stream: simulateReadableStream({
          chunks: [{ type: 'text-start' as const, id: 't' }, ...streamed, ...tail],
        }),
      };
    },
  });
  return { model, signals, prompts, calls: () => call };
}

async function run(steps: Step[], extra: Partial<BuyerTurnDeps> = {}, context = CONTEXT) {
  const mock = modelFrom(steps);
  const usage: AiUsageInput[] = [];
  const waits: number[] = [];
  const incidents: string[] = [];
  const deps: BuyerTurnDeps = {
    resolveModel: () => ({ model: mock.model, modelId: 'gemini-test' }),
    recordUsage: async (row) => {
      usage.push(row);
    },
    random: () => 0,
    reportIncident: (kind) => {
      incidents.push(kind);
    },
    sleep: async (ms) => {
      waits.push(ms);
    },
    ...extra,
  };
  const generator = runBuyerTurn(
    {
      organizationId: CONTEXT.session.organizationId,
      userId: '00000000-0000-4000-a000-000000000013',
      sessionId: CONTEXT.session.id,
      context,
    },
    deps,
  );
  const events: BuyerTurnEvent[] = [];
  let result: BuyerTurnResult;
  for (;;) {
    const next = await generator.next();
    if (next.done) {
      result = next.value;
      break;
    }
    events.push(next.value);
  }
  return { events, result, usage, waits, mock, incidents };
}

const text = (events: BuyerTurnEvent[]) =>
  events
    .filter((e): e is { type: 'delta'; text: string } => e.type === 'delta')
    .map((e) => e.text)
    .join('');

describe('runBuyerTurn', () => {
  it('streams only the characters of reply as deltas and returns the validated turn', async () => {
    const { events, result, usage, mock } = await run([
      { text: json('Mmm, ¿y eso cuánto me costaría?', { revealed: ['timeline'] }) },
    ]);
    expect(events.every((e) => e.type === 'delta')).toBe(true);
    expect(text(events)).toBe('Mmm, ¿y eso cuánto me costaría?');
    expect(events.some((e) => e.type === 'delta' && e.text.includes('{'))).toBe(false);
    expect(result).toMatchObject({
      ok: true,
      reply: 'Mmm, ¿y eso cuánto me costaría?',
      metaStatus: 'valid',
      meta: { interest_delta: 5, revealed: ['timeline'] },
      providerWaitMs: 0,
    });
    expect(usage).toHaveLength(1);
    expect(usage[0]).toMatchObject({
      task: 'buyer',
      simulationId: CONTEXT.session.id,
      outcome: 'success',
      attempt: 1,
      inputTokens: 120,
      outputTokens: 30,
    });
    expect(usage[0]!.firstChunkMs).toEqual(expect.any(Number));
    expect(mock.calls()).toBe(1);
  });

  it('never passes the browser signal: only its own timeout', async () => {
    const { mock } = await run([{ text: json('Hola.') }]);
    expect(mock.signals[0]).toBeInstanceOf(AbortSignal);
    expect(mock.signals[0]?.aborted).toBe(false);
  });

  it('invalid metadata → reset and up to 2 regenerations → fallback with change 0', async () => {
    const bad = JSON.stringify({ reply: 'Te escucho.', meta: { interest_delta: 'mucho' } });
    const { events, result, usage, mock } = await run([{ text: bad }]);
    expect(mock.calls()).toBe(3);
    expect(events.filter((e) => e.type === 'reset')).toHaveLength(2);
    expect(result).toMatchObject({
      ok: true,
      reply: 'Te escucho.',
      metaStatus: 'fallback',
      meta: { interest_delta: 0, revealed: [], end: false },
    });
    expect(usage.map((u) => u.outcome)).toEqual(['retry', 'retry', 'success']);
    expect(usage.map((u) => u.attempt)).toEqual([1, 2, 3]);
  });

  it('invalid metadata then valid → corrected turn after one reset', async () => {
    const { events, result } = await run([
      { text: JSON.stringify({ reply: 'Ajá.', meta: {} }) },
      { text: json('Cuéntame más.', { interest_delta: 40 }) },
    ]);
    expect(events.filter((e) => e.type === 'reset')).toHaveLength(1);
    expect(result).toMatchObject({ ok: true, reply: 'Cuéntame más.', metaStatus: 'corrected' });
  });

  it('429 before the first delta → retrying events with the accumulated wait', async () => {
    const { events, result, waits, usage } = await run([
      { status: 429 },
      { status: 503 },
      { text: json('Perdón, se me fue la señal.') },
    ]);
    expect(events.filter((e) => e.type === 'retrying')).toEqual([
      { type: 'retrying', attempt: 2, waitMs: 1000 },
      { type: 'retrying', attempt: 3, waitMs: 3000 },
    ]);
    expect(waits).toEqual([1000, 3000]);
    expect(result).toMatchObject({ ok: true, providerWaitMs: 4000 });
    expect(usage.map((u) => u.outcome)).toEqual(['retry', 'retry', 'success']);
  });

  it('provider down for every attempt → failure without reply', async () => {
    const { result, usage } = await run([{ status: 503 }]);
    expect(result).toEqual({ ok: false, providerWaitMs: 4000 });
    expect(usage.map((u) => u.outcome)).toEqual(['retry', 'retry', 'failure']);
  });

  it('a non-retryable error is not retried', async () => {
    const { result, usage } = await run([{ status: 400 }]);
    expect(result).toEqual({ ok: false, providerWaitMs: 0 });
    expect(usage.map((u) => u.outcome)).toEqual(['failure']);
  });

  it('failure in the middle of the stream → reset and no turn', async () => {
    const { events, result, usage, mock } = await run([
      { text: json('Mira, la verdad es que el precio me preocupa bastante.'), failAfter: 5 },
    ]);
    expect(text(events).length).toBeGreaterThan(0);
    expect(events.at(-1)).toEqual({ type: 'reset' });
    expect(result).toEqual({ ok: false, providerWaitMs: 0 });
    expect(mock.calls()).toBe(1);
    expect(usage.map((u) => u.outcome)).toEqual(['failure']);
  });

  it('abandonment without a goodbye → one retry with a server note, then the catalog farewell', async () => {
    const context = { ...CONTEXT, session: { ...CONTEXT.session, interest: 15 } };
    const { events, result, mock } = await run(
      [{ text: json('No me parece.', { interest_delta: -10 }) }],
      {},
      context,
    );
    expect(mock.calls()).toBe(2);
    expect(mock.prompts[1]).toContain('nota_del_servidor');
    expect(mock.prompts[0]).not.toContain('nota_del_servidor');
    expect(events.filter((e) => e.type === 'reset')).toHaveLength(1);
    expect(result).toMatchObject({
      ok: true,
      metaStatus: 'corrected',
      meta: { end: true, end_reason: 'buyer_abandoned' },
    });
    if (result.ok) {
      expect(result.reply.startsWith('No me parece.')).toBe(true);
      expect(result.reply.length).toBeGreaterThan('No me parece.'.length);
    }
  });

  it('abandonment with a goodbye is kept as is', async () => {
    const context = { ...CONTEXT, session: { ...CONTEXT.session, interest: 15 } };
    const { result, mock } = await run(
      [{ text: json('No me convence, gracias. Adiós.', { interest_delta: -10 }) }],
      {},
      context,
    );
    expect(mock.calls()).toBe(1);
    expect(result).toMatchObject({ ok: true, reply: 'No me convence, gracias. Adiós.' });
  });

  it('out-of-role replies are regenerated', async () => {
    const { result, mock } = await run(
      [{ text: json('Como modelo de lenguaje no puedo.') }, { text: json('¿Y eso qué incluye?') }],
      { isOutOfRole: (reply) => reply.includes('modelo de lenguaje') },
    );
    expect(mock.calls()).toBe(2);
    expect(result).toMatchObject({ ok: true, reply: '¿Y eso qué incluye?' });
  });

  it('sends the seller messages as user messages and the case data delimited', async () => {
    const { mock } = await run([{ text: json('Hola.') }]);
    const prompt = JSON.parse(mock.prompts[0]!) as Array<{ role: string; content: unknown }>;
    expect(prompt[0]!.role).toBe('system');
    expect(JSON.stringify(prompt[1])).toContain('<ficha>');
    expect(prompt.at(-1)).toMatchObject({ role: 'user' });
    expect(JSON.stringify(prompt.at(-1))).toContain('¿qué buscas?');
  });

  it('a literal undeclared reveal is added to the metadata and reported (ids only)', async () => {
    const { result, incidents } = await run([
      { text: json('Pensaba gastar entre S/ 800 y S/ 1 200, no más.') },
    ]);
    expect(result).toMatchObject({
      ok: true,
      metaStatus: 'corrected',
      meta: { revealed: ['budget'] },
    });
    expect(incidents).toEqual(['undeclared_reveal']);
  });

  it('out of role by default guard → regenerated and reported; fallback reported', async () => {
    const { result, incidents, mock } = await run([
      { text: json('Como modelo de lenguaje no tengo presupuesto.') },
      { text: json('Prefiero no decirlo todavía.') },
    ]);
    expect(mock.calls()).toBe(2);
    expect(result).toMatchObject({ ok: true, reply: 'Prefiero no decirlo todavía.' });
    expect(incidents).toEqual(['out_of_role']);

    const bad = JSON.stringify({ reply: 'Te escucho.', meta: {} });
    const fallback = await run([{ text: bad }]);
    expect(fallback.incidents).toEqual(['meta_fallback']);
  });
});
