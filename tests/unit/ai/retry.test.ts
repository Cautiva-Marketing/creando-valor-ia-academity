import { APICallError } from 'ai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isRetryableAiError, RetryFailure, withRetry } from '@/lib/ai/retry';

/** research.md §R5, FR-058: 3 attempts in total, 1 s and 3 s waits with jitter, only 429/5xx/timeout. */

function apiError(statusCode: number) {
  return new APICallError({
    message: `status ${statusCode}`,
    url: 'https://example.test',
    requestBodyValues: {},
    statusCode,
  });
}

describe('isRetryableAiError', () => {
  it.each([
    [apiError(429), true],
    [apiError(500), true],
    [apiError(503), true],
    [apiError(400), false],
    [apiError(401), false],
    [Object.assign(new Error('timeout'), { name: 'TimeoutError' }), true],
    [Object.assign(new Error('aborted'), { name: 'AbortError' }), true],
    [new Error('schema mismatch'), false],
  ])('%s → %s', (error, expected) => {
    expect(isRetryableAiError(error)).toBe(expected);
  });

  it('looks inside a RetryError-like wrapper', () => {
    const wrapper = Object.assign(new Error('retry'), {
      name: 'AI_RetryError',
      lastError: apiError(429),
    });
    expect(isRetryableAiError(wrapper)).toBe(true);
  });
});

describe('withRetry', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('returns at the first success without waiting', async () => {
    const fn = vi.fn(async () => 'ok');
    await expect(withRetry(fn)).resolves.toEqual({ value: 'ok', attempts: 1, waitedMs: 0 });
    expect(fn).toHaveBeenCalledWith(1);
  });

  it('retries 429 twice with 1 s and 3 s waits plus jitter and reports each wait', async () => {
    const onRetry = vi.fn();
    const fn = vi
      .fn<(attempt: number) => Promise<string>>()
      .mockRejectedValueOnce(apiError(429))
      .mockRejectedValueOnce(apiError(503))
      .mockResolvedValueOnce('ok');
    const promise = withRetry(fn, { onRetry, random: () => 0.5, jitterRatio: 0.2 });
    await vi.advanceTimersByTimeAsync(1100);
    expect(onRetry).toHaveBeenNthCalledWith(1, 1, 1100, expect.anything());
    await vi.advanceTimersByTimeAsync(3300);
    expect(onRetry).toHaveBeenNthCalledWith(2, 2, 3300, expect.anything());
    await expect(promise).resolves.toEqual({ value: 'ok', attempts: 3, waitedMs: 4400 });
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('gives up after 3 attempts with the accumulated wait', async () => {
    const fn = vi.fn(async () => {
      throw apiError(500);
    });
    const promise = withRetry(fn, { random: () => 0 });
    const assertion = expect(promise).rejects.toMatchObject({
      name: 'RetryFailure',
      attempts: 3,
      waitedMs: 4000,
      retryable: true,
    });
    await vi.advanceTimersByTimeAsync(5000);
    await assertion;
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('does not retry non-retryable errors', async () => {
    const fn = vi.fn(async () => {
      throw apiError(400);
    });
    const error = await withRetry(fn).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RetryFailure);
    expect(error).toMatchObject({ attempts: 1, waitedMs: 0, retryable: false });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('stops when the next wait would exceed the budget', async () => {
    const fn = vi.fn(async () => {
      throw apiError(429);
    });
    const promise = withRetry(fn, { random: () => 0, budgetMs: 2000 });
    const assertion = expect(promise).rejects.toMatchObject({ attempts: 2, waitedMs: 1000 });
    await vi.advanceTimersByTimeAsync(1000);
    await assertion;
  });

  it('honours a custom shouldRetry (e.g. only before the first chunk)', async () => {
    const fn = vi.fn(async () => {
      throw apiError(429);
    });
    const error = await withRetry(fn, { shouldRetry: () => false }).catch((e: unknown) => e);
    expect(error).toMatchObject({ attempts: 1 });
  });
});
