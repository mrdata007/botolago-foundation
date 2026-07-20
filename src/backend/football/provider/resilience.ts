import { FootballError } from "../errors";

export interface ProviderResiliencePolicy {
  readonly timeoutMs: number;
  readonly maxRetries: number;
  readonly retryBaseMs: number;
  readonly retryMaxMs: number;
  readonly circuitFailureThreshold: number;
  readonly circuitResetMs: number;
}

export const DEFAULT_PROVIDER_RESILIENCE: ProviderResiliencePolicy = {
  timeoutMs: 10_000,
  maxRetries: 3,
  retryBaseMs: 250,
  retryMaxMs: 5_000,
  circuitFailureThreshold: 5,
  circuitResetMs: 30_000,
};

export class ProviderCircuitBreaker {
  private failures = 0;
  private openedAt: number | null = null;

  constructor(
    private readonly threshold: number,
    private readonly resetMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  assertAvailable(): void {
    if (this.openedAt === null) return;
    if (this.now() - this.openedAt >= this.resetMs) {
      this.failures = 0;
      this.openedAt = null;
      return;
    }
    throw new FootballError("provider_unavailable", "The provider circuit is temporarily open.");
  }

  success(): void {
    this.failures = 0;
    this.openedAt = null;
  }

  failure(): void {
    this.failures += 1;
    if (this.failures >= this.threshold) this.openedAt = this.now();
  }

  state(): "closed" | "open" {
    return this.openedAt === null ? "closed" : "open";
  }
}

export interface RetryRuntime {
  readonly sleep: (milliseconds: number) => Promise<void>;
  readonly random: () => number;
}

const defaultRuntime: RetryRuntime = {
  sleep: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  random: Math.random,
};

function retryable(error: unknown): boolean {
  return (
    error instanceof FootballError &&
    (error.code === "provider_unavailable" || error.code === "provider_rate_limited")
  );
}

export async function withProviderResilience<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  breaker: ProviderCircuitBreaker,
  policy: ProviderResiliencePolicy = DEFAULT_PROVIDER_RESILIENCE,
  runtime: RetryRuntime = defaultRuntime,
): Promise<T> {
  breaker.assertAvailable();
  let lastError: unknown;
  for (let attempt = 0; attempt <= policy.maxRetries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), policy.timeoutMs);
    try {
      const result = await operation(controller.signal);
      breaker.success();
      return result;
    } catch (error) {
      lastError = controller.signal.aborted
        ? new FootballError("provider_unavailable", "The provider request timed out.", error)
        : error;
      if (!retryable(lastError) || attempt === policy.maxRetries) {
        breaker.failure();
        throw lastError;
      }
      const exponential = Math.min(policy.retryMaxMs, policy.retryBaseMs * 2 ** attempt);
      const jitter = Math.floor(exponential * 0.25 * runtime.random());
      await runtime.sleep(exponential + jitter);
    } finally {
      clearTimeout(timeout);
    }
  }
  breaker.failure();
  throw lastError;
}
