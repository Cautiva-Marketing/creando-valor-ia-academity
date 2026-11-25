import { describe, expect, it, vi } from 'vitest';
import { handleStatus, type StatusHandlerDeps } from '@/features/practice/status-handler';
import type { RequestContext } from '@/lib/auth/context-types';

/** T137 — GET /api/practicas/[id]/estado (contracts/route-handlers.md). */

const SESSION = '00000000-0000-4000-9000-000000000e01';
const USER = '00000000-0000-4000-a000-000000000013';

const CTX = { user_id: USER, session_ok: true } as RequestContext;

const ROW = {
  status: 'finalized',
  evaluation_status: 'in_progress',
  evaluation_phase: 'scoring',
  evaluation_manual_retries: 1,
  end_reason: 'seller_ended',
};

function deps(overrides: Partial<StatusHandlerDeps> = {}, row: unknown = ROW) {
  const filters: Record<string, unknown> = {};
  const builder = {
    select: vi.fn(() => builder),
    eq: (column: string, value: unknown) => {
      filters[column] = value;
      return builder;
    },
    maybeSingle: async () => ({ data: row, error: null }),
  };
  const client = { from: vi.fn(() => builder) };
  const value: StatusHandlerDeps = {
    loadContext: async () => CTX,
    rateLimit: vi.fn(async () => ({ allowed: true, retryAfterSeconds: 0 })),
    userClient: async () => client as never,
    ...overrides,
  };
  return { deps: value, client, filters };
}

describe('handleStatus', () => {
  it('no session → 401 before the rate limit', async () => {
    const d = deps({ loadContext: async () => null });
    const response = await handleStatus(SESSION, d.deps);
    expect(response.status).toBe(401);
    expect(d.deps.rateLimit).not.toHaveBeenCalled();
  });

  it('rate limit practice_status → 429 with Retry-After and rate_limited', async () => {
    const d = deps({ rateLimit: async () => ({ allowed: false, retryAfterSeconds: 42 }) });
    const response = await handleStatus(SESSION, d.deps);
    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('42');
    expect(await response.json()).toMatchObject({ code: 'rate_limited' });
    expect(d.client.from).not.toHaveBeenCalled();
  });

  it('invalid id → 400 after the rate limit', async () => {
    const d = deps();
    const response = await handleStatus('nope', d.deps);
    expect(response.status).toBe(400);
    expect(d.deps.rateLimit).toHaveBeenCalledWith(USER);
  });

  it('another seller’s session (RLS returns nothing) → 404', async () => {
    const response = await handleStatus(SESSION, deps({}, null).deps);
    expect(response.status).toBe(404);
  });

  it('200 with the documented shape and no-store', async () => {
    const d = deps();
    const response = await handleStatus(SESSION, d.deps);
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.json()).toEqual({
      status: 'finalized',
      evaluationStatus: 'in_progress',
      evaluationPhase: 'scoring',
      manualRetriesLeft: 2,
      endReason: 'seller_ended',
    });
    expect(d.filters).toEqual({ id: SESSION, user_id: USER });
  });
});
