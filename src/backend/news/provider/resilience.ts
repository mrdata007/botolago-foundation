import { NewsProviderError } from "./contracts";

export interface NewsRetryPolicy {
  readonly attempts: number;
  readonly timeoutMs: number;
  readonly baseDelayMs: number;
  readonly maxDelayMs: number;
}

export const DEFAULT_NEWS_RETRY_POLICY: NewsRetryPolicy = {
  attempts: 4,
  timeoutMs: 10_000,
  baseDelayMs: 250,
  maxDelayMs: 5_000,
};

export function newsBackoffDelay(attempt: number, policy: NewsRetryPolicy, jitter = 0.5): number {
  const boundedJitter = Math.min(Math.max(jitter, 0), 1);
  const exponential = Math.min(policy.maxDelayMs, policy.baseDelayMs * 2 ** attempt);
  return Math.round(exponential * (0.75 + boundedJitter * 0.5));
}

export async function withNewsProviderResilience<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  policy: NewsRetryPolicy = DEFAULT_NEWS_RETRY_POLICY,
  wait: (milliseconds: number) => Promise<void> = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < policy.attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), policy.timeoutMs);
    try {
      return await operation(controller.signal);
    } catch (error) {
      lastError = error;
      const retryable = error instanceof NewsProviderError ? error.retryable : false;
      if (!retryable || attempt === policy.attempts - 1) throw error;
      const delay =
        error instanceof NewsProviderError && error.retryAfterMs !== null
          ? error.retryAfterMs
          : newsBackoffDelay(attempt, policy);
      await wait(delay);
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new NewsProviderError(
    "provider_unavailable",
    "Provider retry budget exhausted.",
    false,
    null,
    lastError,
  );
}
