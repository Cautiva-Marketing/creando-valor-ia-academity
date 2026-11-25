import { beforeEach, describe, expect, it, vi } from 'vitest';

/** T029 (FR-019): one ai_usage row per attempt, never content; simulation_id NULL only in buyer_setup. */

const rpc = vi.fn(async (..._args: unknown[]) => ({ error: null }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ rpc }) }));
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));

const { buildAiUsageRow, recordAiUsage } = await import('@/lib/ai/usage');
const Sentry = await import('@sentry/nextjs');

const base = {
  organizationId: '00000000-0000-4000-b000-00000000000a',
  userId: '00000000-0000-4000-a000-000000000011',
  model: 'gemini-2.5-flash',
  latencyMs: 1234,
};
const sessionId = '00000000-0000-4000-9000-000000000a01';

describe('buildAiUsageRow', () => {
  it('maps a successful buyer turn with its session, tokens, first chunk and list cost', () => {
    expect(
      buildAiUsageRow({
        ...base,
        task: 'buyer',
        simulationId: sessionId,
        inputTokens: 1_000_000,
        outputTokens: 100_000,
        firstChunkMs: 800,
        outcome: 'success',
        attempt: 1,
      }),
    ).toEqual({
      organization_id: base.organizationId,
      user_id: base.userId,
      task: 'buyer',
      model: 'gemini-2.5-flash',
      simulation_id: sessionId,
      input_tokens: 1_000_000,
      output_tokens: 100_000,
      latency_ms: 1234,
      first_chunk_ms: 800,
      estimated_cost_usd: 0.55,
      outcome: 'success',
      attempt: 1,
    });
  });

  it('records zero tokens and cost for failed attempts', () => {
    const row = buildAiUsageRow({
      ...base,
      task: 'evaluator',
      simulationId: sessionId,
      outcome: 'retry',
      attempt: 2,
    });
    expect(row).toMatchObject({
      input_tokens: 0,
      output_tokens: 0,
      estimated_cost_usd: 0,
      first_chunk_ms: null,
    });
  });

  it('keeps simulation_id null for buyer_setup', () => {
    expect(
      buildAiUsageRow({ ...base, task: 'buyer_setup', outcome: 'failure', attempt: 3 }),
    ).toMatchObject({
      simulation_id: null,
      task: 'buyer_setup',
    });
  });

  it('rejects buyer/evaluator rows without a session and buyer_setup rows with one', () => {
    expect(() =>
      buildAiUsageRow({ ...base, task: 'buyer', outcome: 'success', attempt: 1 } as never),
    ).toThrow(/simulationId/);
    expect(() =>
      buildAiUsageRow({
        ...base,
        task: 'buyer_setup',
        simulationId: sessionId,
        outcome: 'success',
        attempt: 1,
      } as never),
    ).toThrow(/simulationId/);
  });

  it('never carries content keys', () => {
    const row = buildAiUsageRow({
      ...base,
      task: 'buyer',
      simulationId: sessionId,
      outcome: 'success',
      attempt: 1,
      ...({ content: 'secreto', prompt: 'p' } as object),
    });
    expect(Object.keys(row)).not.toContain('content');
    expect(Object.keys(row)).not.toContain('prompt');
  });
});

describe('recordAiUsage', () => {
  beforeEach(() => rpc.mockClear());

  it('writes through insert_ai_usage with the admin client', async () => {
    await recordAiUsage({
      ...base,
      task: 'buyer_setup',
      outcome: 'success',
      attempt: 1,
      inputTokens: 10,
      outputTokens: 5,
    });
    expect(rpc).toHaveBeenCalledWith('insert_ai_usage', {
      p_row: expect.objectContaining({ task: 'buyer_setup', input_tokens: 10, output_tokens: 5 }),
    });
  });

  it('never throws: a failed write is reported without content', async () => {
    rpc.mockResolvedValueOnce({ error: { code: '23514', message: 'boom' } } as never);
    await expect(
      recordAiUsage({
        ...base,
        task: 'buyer',
        simulationId: sessionId,
        outcome: 'success',
        attempt: 1,
      }),
    ).resolves.toBeUndefined();
    expect(Sentry.captureException).toHaveBeenCalled();
  });
});
