import { describe, expect, it, vi } from 'vitest';
import type { BuyerTurnEvent, BuyerTurnResult } from '@/features/practice/ai/buyer-turn';
import type { TurnStreamEvent } from '@/features/practice/stream/protocol';
import { handleTurn, type TurnHandlerDeps } from '@/features/practice/turn-handler';
import type { RequestContext } from '@/lib/auth/context-types';

/** T098 — order and codes of contracts/route-handlers.md → POST /api/practicas/[id]/turnos. */

const SESSION = '00000000-0000-4000-9000-000000000c11';
const ORG = '00000000-0000-4000-b000-00000000000c';
const USER = '00000000-0000-4000-a000-000000000013';
const CLIENT_MESSAGE = '00000000-0000-4000-8000-0000000c0001';

const CTX: RequestContext = {
  user_id: USER,
  email: 'vendedor@example.test',
  full_name: 'Vendedor',
  timezone: 'America/Lima',
  session_ok: true,
  aal: 'aal1',
  is_superadmin_account: false,
  has_verified_factor: false,
  onboarding_status: 'completed',
  onboarding_step: 3,
  memberships: [
    {
      organization_id: ORG,
      type: 'personal',
      status: 'active',
      roles: ['vendedor'],
      org_status: 'active',
    },
  ],
};

const STATE = {
  interest: 50,
  mood: 'doubtful',
  lastDelta: 5,
  sellerMessageCount: 1,
  messagesLeft: 19,
  deadlineAt: '2026-11-24T15:20:00Z',
  reveals: [],
  turnInProgress: false,
  hintAvailable: true,
};

type RpcResult = { data: unknown; error: { code: string; details?: string } | null };

/** Minimal Supabase fake: rpc(name) answers from `rpcs`; from().select().eq().eq() from `messages`. */
function fakeClient(rpcs: Record<string, RpcResult | (() => RpcResult)>) {
  const calls: Array<{ name: string; args: unknown }> = [];
  const resultOf = (name: string): RpcResult => {
    const entry = rpcs[name];
    if (!entry) return { data: null, error: { code: 'XX000' } };
    return typeof entry === 'function' ? entry() : entry;
  };
  const client = {
    calls,
    rpc(name: string, args: unknown) {
      calls.push({ name, args });
      const result = resultOf(name);
      const promise = Promise.resolve(result);
      return Object.assign(promise, { single: () => promise });
    },
    from(table: string) {
      const filters: Record<string, unknown> = {};
      const builder = {
        select: () => builder,
        eq: (column: string, value: unknown) => {
          filters[column] = value;
          return builder;
        },
        single: async () =>
          table === 'practice_messages'
            ? {
                data: {
                  seq: filters.seq,
                  content: `contenido ${String(filters.seq)}`,
                  created_at: '2026-11-24T15:00:00Z',
                },
                error: null,
              }
            : { data: null, error: { code: 'PGRST116' } },
        maybeSingle: async () => ({ data: { status: 'finalized' }, error: null }),
      };
      return builder;
    },
  };
  return client;
}

function request(body: unknown = { clientMessageId: CLIENT_MESSAGE, text: '  Hola  ' }) {
  return new Request(`http://localhost/api/practicas/${SESSION}/turnos`, {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

async function* turnOf(
  events: BuyerTurnEvent[],
  result: BuyerTurnResult,
): AsyncGenerator<BuyerTurnEvent, BuyerTurnResult, void> {
  for (const event of events) yield event;
  return result;
}

const OK_RESULT: BuyerTurnResult = {
  ok: true,
  reply: 'Hola, cuéntame.',
  meta: {
    interest_delta: 5,
    revealed: [],
    hidden_objection_raised: null,
    seller_abusive: false,
    end: false,
    end_reason: null,
  },
  metaStatus: 'valid',
  providerWaitMs: 0,
};

function setup(overrides: {
  ctx?: RequestContext | null;
  allowed?: boolean;
  begin?: RpcResult;
  commit?: RpcResult;
  turn?: () => AsyncGenerator<BuyerTurnEvent, BuyerTurnResult, void>;
}) {
  const user = fakeClient({
    begin_practice_turn: overrides.begin ?? {
      data: { seller_seq: 2, already_answered: false, buyer_seq: null, closed: false },
      error: null,
    },
  });
  const admin = fakeClient({
    get_practice_turn_context: { data: { session: {} }, error: null },
    commit_practice_turn: overrides.commit ?? {
      data: {
        buyer_seq: 3,
        state: STATE,
        ended: false,
        end_reason: null,
        evaluation_status: null,
      },
      error: null,
    },
    release_practice_turn: { data: null, error: null },
  });
  const work: Array<Promise<unknown>> = [];
  const runTurn = vi.fn(
    overrides.turn ?? (() => turnOf([{ type: 'delta', text: 'Hola' }], OK_RESULT)),
  );
  const deps: TurnHandlerDeps = {
    loadContext: async () => (overrides.ctx === undefined ? CTX : overrides.ctx),
    rateLimit: async () => ({ allowed: overrides.allowed ?? true, retryAfterSeconds: 42 }),
    userClient: async () => user as never,
    adminClient: () => admin as never,
    runTurn,
    scheduleEvaluation: vi.fn(),
    keepAlive: (promise) => {
      work.push(promise);
    },
    report: () => 'REF12345',
  };
  return { deps, user, admin, runTurn, work };
}

async function events(response: Response): Promise<TurnStreamEvent[]> {
  const text = await response.text();
  return text
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as TurnStreamEvent);
}

describe('POST /api/practicas/[id]/turnos', () => {
  it('401 without a session (before the rate limit)', async () => {
    const { deps } = setup({ ctx: null });
    const rateLimit = vi.spyOn(deps, 'rateLimit');
    const response = await handleTurn(request(), SESSION, deps);
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ code: 'unauthorized' });
    expect(rateLimit).not.toHaveBeenCalled();
  });

  it('401 when the session is out of policy', async () => {
    const { deps } = setup({ ctx: { ...CTX, session_ok: false } });
    expect((await handleTurn(request(), SESSION, deps)).status).toBe(401);
  });

  it('429 practice_turn with Retry-After', async () => {
    const { deps, user } = setup({ allowed: false });
    const response = await handleTurn(request(), SESSION, deps);
    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('42');
    expect(await response.json()).toMatchObject({ code: 'rate_limited', retryAfterSeconds: 42 });
    expect(user.calls).toHaveLength(0);
  });

  it('400 for an invalid body or id', async () => {
    const { deps } = setup({});
    const blank = await handleTurn(
      request({ clientMessageId: CLIENT_MESSAGE, text: '   ' }),
      SESSION,
      deps,
    );
    expect(blank.status).toBe(400);
    expect(await blank.json()).toMatchObject({
      code: 'validation',
      fieldErrors: { text: expect.any(Array) },
    });
    expect((await handleTurn(request('not json'), SESSION, deps)).status).toBe(400);
    expect((await handleTurn(request(), 'no-uuid', deps)).status).toBe(400);
    expect(
      (
        await handleTurn(
          request({ clientMessageId: CLIENT_MESSAGE, text: 'x'.repeat(1001) }),
          SESSION,
          deps,
        )
      ).status,
    ).toBe(400);
  });

  it('403 suspended for a suspended organization', async () => {
    const { deps } = setup({
      ctx: { ...CTX, memberships: [{ ...CTX.memberships[0]!, org_status: 'suspended' }] },
    });
    const response = await handleTurn(request(), SESSION, deps);
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: 'suspended' });
  });

  it('404 for a session of another user', async () => {
    const { deps } = setup({ begin: { data: null, error: { code: 'P0002' } } });
    expect((await handleTurn(request(), SESSION, deps)).status).toBe(404);
  });

  it('409 with details for conflicts', async () => {
    for (const reason of ['turn_in_progress', 'message_limit']) {
      const { deps } = setup({ begin: { data: null, error: { code: 'P0010', details: reason } } });
      const response = await handleTurn(request(), SESSION, deps);
      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({ code: 'conflict', details: { reason } });
    }
    const { deps } = setup({
      begin: { data: null, error: { code: 'P0010', details: 'not_active' } },
    });
    expect(await (await handleTurn(request(), SESSION, deps)).json()).toMatchObject({
      details: { reason: 'not_active', status: 'finalized' },
    });
  });

  it('a session closed by time on begin → 409 not_active and the evaluation is scheduled', async () => {
    const { deps } = setup({
      begin: {
        data: { seller_seq: null, already_answered: false, buyer_seq: null, closed: true },
        error: null,
      },
    });
    const response = await handleTurn(request(), SESSION, deps);
    expect(response.status).toBe(409);
    expect(deps.scheduleEvaluation).toHaveBeenCalledWith(SESSION);
  });

  it('already answered → a single turn event without calling the AI', async () => {
    const { deps, runTurn, admin } = setup({
      begin: {
        data: { seller_seq: 2, already_answered: true, buyer_seq: 3, closed: false },
        error: null,
      },
    });
    const response = await handleTurn(request(), SESSION, deps);
    expect(response.status).toBe(200);
    const list = await events(response);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ type: 'turn', buyerMessage: { seq: 3, id: 'm3' } });
    expect(runTurn).not.toHaveBeenCalled();
    expect(admin.calls.map((c) => c.name)).toEqual(['commit_practice_turn']);
  });

  it('streams ack, deltas and turn as NDJSON without cache', async () => {
    const { deps, user, admin, work } = setup({});
    const response = await handleTurn(request(), SESSION, deps);
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('application/x-ndjson');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    const list = await events(response);
    await Promise.all(work);
    expect(list.map((e) => e.type)).toEqual(['ack', 'delta', 'turn']);
    expect(list[0]).toMatchObject({ sellerMessage: { seq: 2, id: 'm2' } });
    expect(list[2]).toMatchObject({ state: { interest: 50, mood: 'doubtful', reveals: [] } });
    expect(user.calls[0]).toEqual({
      name: 'begin_practice_turn',
      args: { p_session: SESSION, p_client_message_id: CLIENT_MESSAGE, p_text: 'Hola' },
    });
    expect(admin.calls.map((c) => c.name)).toEqual([
      'get_practice_turn_context',
      'commit_practice_turn',
    ]);
  });

  it('a turn that ends the session → ended event and evaluation scheduled', async () => {
    const { deps, work } = setup({
      commit: {
        data: {
          buyer_seq: 3,
          state: STATE,
          ended: true,
          end_reason: 'goal_achieved',
          evaluation_status: 'pending',
        },
        error: null,
      },
    });
    const list = await events(await handleTurn(request(), SESSION, deps));
    await Promise.all(work);
    expect(list.at(-1)).toEqual({
      type: 'ended',
      endReason: 'goal_achieved',
      evaluationStatus: 'pending',
    });
    expect(deps.scheduleEvaluation).toHaveBeenCalledWith(SESSION);
  });

  it('AI failure → release with the wait and a retryable error without turn', async () => {
    const { deps, admin, work } = setup({
      turn: () =>
        turnOf(
          [
            { type: 'retrying', attempt: 2, waitMs: 1000 },
            { type: 'delta', text: 'Ho' },
            { type: 'reset' },
          ],
          { ok: false, providerWaitMs: 1000 },
        ),
    });
    const list = await events(await handleTurn(request(), SESSION, deps));
    await Promise.all(work);
    expect(list.map((e) => e.type)).toEqual(['ack', 'retrying', 'delta', 'reset', 'error']);
    expect(list.at(-1)).toMatchObject({ code: 'ai_unavailable', retryable: true });
    const release = admin.calls.find((c) => c.name === 'release_practice_turn');
    expect(release?.args).toMatchObject({ p_seller_seq: 2, p_provider_wait_ms: 1000 });
    expect(admin.calls.some((c) => c.name === 'commit_practice_turn')).toBe(false);
  });

  it('the generation goes on and is committed if the browser disconnects', async () => {
    const { deps, admin, work } = setup({});
    const response = await handleTurn(request(), SESSION, deps);
    await response.body?.cancel();
    await Promise.all(work);
    expect(admin.calls.map((c) => c.name)).toContain('commit_practice_turn');
  });
});
