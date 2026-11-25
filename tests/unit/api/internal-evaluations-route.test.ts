import { describe, expect, it, vi } from 'vitest';
import {
  bearerMatches,
  handleDispatch,
  type DispatchDeps,
} from '@/features/practice/evaluation/dispatch-handler';

/** T137 — POST /api/internal/practice/evaluations (contracts/route-handlers.md; research.md §R8). */

const SECRET = 'local-dev-practice-dispatch-secret-0000000000';
const ID_A = '00000000-0000-4000-9000-000000000e01';
const ID_B = '00000000-0000-4000-9000-000000000e02';

function request(body: unknown, auth: string | null = `Bearer ${SECRET}`): Request {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (auth !== null) headers.set('authorization', auth);
  return new Request('http://localhost/api/internal/practice/evaluations', {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function deps() {
  const order: string[] = [];
  const pending: Array<() => Promise<void>> = [];
  let active = 0;
  let maxActive = 0;
  const value: DispatchDeps = {
    secret: () => SECRET,
    runEvaluation: vi.fn(async (id: string) => {
      active++;
      maxActive = Math.max(maxActive, active);
      order.push(`start:${id}`);
      await new Promise((resolve) => setTimeout(resolve, 5));
      order.push(`end:${id}`);
      active--;
    }),
    keepAlive: (work) => {
      pending.push(work);
    },
  };
  return { deps: value, order, pending, maxActive: () => maxActive };
}

describe('bearerMatches', () => {
  it('compares the Bearer in constant time (equal-length digests)', () => {
    expect(bearerMatches(`Bearer ${SECRET}`, SECRET)).toBe(true);
    expect(bearerMatches(`Bearer ${SECRET}x`, SECRET)).toBe(false);
    expect(bearerMatches('Bearer x', SECRET)).toBe(false);
    expect(bearerMatches(SECRET, SECRET)).toBe(false);
    expect(bearerMatches(null, SECRET)).toBe(false);
    expect(bearerMatches('Bearer ', '')).toBe(false);
  });
});

describe('handleDispatch', () => {
  it.each([null, 'Bearer wrong-secret', `Basic ${SECRET}`])(
    'wrong or missing Bearer (%s) → 401 without body and nothing runs',
    async (auth) => {
      const d = deps();
      const response = await handleDispatch(request({ sessionIds: [ID_A] }, auth), d.deps);
      expect(response.status).toBe(401);
      expect(await response.text()).toBe('');
      expect(d.pending).toHaveLength(0);
    },
  );

  it.each([
    ['no ids', { sessionIds: [] }],
    ['six ids', { sessionIds: Array(6).fill(ID_A) }],
    ['not a uuid', { sessionIds: ['abc'] }],
    ['not json', '{'],
  ])('invalid body (%s) → 400', async (_name, body) => {
    const d = deps();
    const response = await handleDispatch(request(body), d.deps);
    expect(response.status).toBe(400);
    expect(d.pending).toHaveLength(0);
  });

  it('202 immediately; evaluations run sequentially after the response', async () => {
    const d = deps();
    const response = await handleDispatch(request({ sessionIds: [ID_A, ID_B, ID_A] }), d.deps);
    expect(response.status).toBe(202);
    expect(d.deps.runEvaluation).not.toHaveBeenCalled();
    expect(d.pending).toHaveLength(1);
    await d.pending[0]!();
    expect(d.order).toEqual([`start:${ID_A}`, `end:${ID_A}`, `start:${ID_B}`, `end:${ID_B}`]);
    expect(d.maxActive()).toBe(1);
  });

  it('a failing evaluation does not stop the rest of the batch', async () => {
    const d = deps();
    d.deps.runEvaluation = vi.fn().mockRejectedValueOnce(new Error('x')).mockResolvedValue('ok');
    await handleDispatch(request({ sessionIds: [ID_A, ID_B] }), d.deps);
    await d.pending[0]!();
    expect(d.deps.runEvaluation).toHaveBeenCalledTimes(2);
  });
});
