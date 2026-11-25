import { APICallError } from 'ai';

/**
 * Own retry loop for AI calls (research.md §R5, FR-058). The AI SDK runs with `maxRetries: 0`; here
 * we allow up to 3 attempts in total (original + 2 retries) with exponential backoff + jitter (1 s,
 * 3 s), only for 429/5xx/timeouts, inside a time budget. Callers are notified of each wait so the
 * turn stream can show "retrying" and the wait is excluded from the session clock (FR-028d).
 */
export interface RetryOptions {
  maxAttempts?: number;
  /** Base wait before retry n (index n-1). */
  delaysMs?: readonly number[];
  /** Up to +ratio of random extra wait. */
  jitterRatio?: number;
  /** Total time budget (calls + waits); a wait that would exceed it is not taken. */
  budgetMs?: number;
  /** Which errors may be retried (default: 429/5xx/timeouts). Buyer setup adds invalid output. */
  isRetryable?: (error: unknown) => boolean;
  /** Extra condition (e.g. "no chunk has been sent yet"). */
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  onRetry?: (attempt: number, waitMs: number, error: unknown) => void;
  random?: () => number;
  now?: () => number;
}

export interface RetrySuccess<T> {
  value: T;
  attempts: number;
  waitedMs: number;
}

/** Thrown when every allowed attempt failed (or the error was not retryable). */
export class RetryFailure extends Error {
  override readonly name = 'RetryFailure';
  constructor(
    readonly lastError: unknown,
    readonly attempts: number,
    readonly waitedMs: number,
    readonly retryable: boolean,
  ) {
    super('AI call failed', { cause: lastError });
  }
}

const DEFAULT_DELAYS = [1000, 3000] as const;

function unwrap(error: unknown): unknown {
  if (error && typeof error === 'object' && 'lastError' in error) {
    return (error as { lastError: unknown }).lastError;
  }
  return error;
}

export function isRetryableAiError(error: unknown): boolean {
  const inner = unwrap(error);
  if (APICallError.isInstance(inner)) {
    const status = inner.statusCode;
    return status === 429 || (status !== undefined && status >= 500);
  }
  if (inner instanceof Error) {
    return inner.name === 'TimeoutError' || inner.name === 'AbortError';
  }
  return false;
}

export function statusOf(error: unknown): number | undefined {
  const inner = unwrap(error);
  return APICallError.isInstance(inner) ? inner.statusCode : undefined;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  options: RetryOptions = {},
): Promise<RetrySuccess<T>> {
  const {
    maxAttempts = 3,
    delaysMs = DEFAULT_DELAYS,
    jitterRatio = 0.25,
    budgetMs = Number.POSITIVE_INFINITY,
    isRetryable = isRetryableAiError,
    shouldRetry = () => true,
    onRetry,
    random = Math.random,
    now = Date.now,
  } = options;
  const startedAt = now();
  let waitedMs = 0;

  for (let attempt = 1; ; attempt++) {
    try {
      const value = await fn(attempt);
      return { value, attempts: attempt, waitedMs };
    } catch (error) {
      const retryable = isRetryable(error);
      if (!retryable || attempt >= maxAttempts || !shouldRetry(error, attempt)) {
        throw new RetryFailure(error, attempt, waitedMs, retryable);
      }
      const base = delaysMs[Math.min(attempt - 1, delaysMs.length - 1)] ?? 0;
      const waitMs = Math.round(base * (1 + random() * jitterRatio));
      if (now() - startedAt + waitMs > budgetMs) {
        throw new RetryFailure(error, attempt, waitedMs, retryable);
      }
      onRetry?.(attempt, waitMs, error);
      await sleep(waitMs);
      waitedMs += waitMs;
    }
  }
}
