import { FootballError } from "../errors";
import type { ProviderQuota } from "./performance-contracts";
import {
  DEFAULT_PROVIDER_RESILIENCE,
  ProviderCircuitBreaker,
  type ProviderResiliencePolicy,
  type RetryRuntime,
} from "./resilience";

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;
export type RapidApiFailure =
  | "configuration"
  | "invalid_path"
  | "authentication"
  | "access_denied"
  | "request_budget"
  | "quota_floor"
  | "rate_limited"
  | "circuit_open"
  | "timeout"
  | "network"
  | "cancelled"
  | "provider_error"
  | "upstream_missing"
  | "endpoint_rejected"
  | "invalid_json";

/** Safe to serialize by these fields only. No upstream bodies, URLs or causes. */
export class RapidApiRequestError extends FootballError {
  constructor(
    readonly reason: RapidApiFailure,
    readonly httpStatus: number | null = null,
    readonly retryAfterMs: number | null = null,
  ) {
    super(
      reason === "upstream_missing"
        ? "data_unavailable"
        : ["quota_floor", "rate_limited"].includes(reason)
          ? "provider_rate_limited"
          : ["invalid_json", "endpoint_rejected", "invalid_path"].includes(reason)
            ? "invalid_provider_payload"
            : "provider_unavailable",
      `RapidAPI request failed: ${reason}.`,
    );
  }
}

export interface RapidApiClientConfig {
  readonly host: string;
  readonly key: string;
  readonly minRemaining?: number;
  /** Counts every HTTP attempt, including unsuccessful requests and retries. */
  readonly maxRequests?: number;
  readonly policy?: Partial<ProviderResiliencePolicy>;
  readonly fetch?: FetchLike;
  readonly runtime?: RetryRuntime;
  readonly now?: () => number;
}

const RAPIDAPI_POLICY: ProviderResiliencePolicy = {
  ...DEFAULT_PROVIDER_RESILIENCE,
  timeoutMs: 15_000,
  maxRetries: 2,
};
const defaultRuntime: RetryRuntime = {
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  random: Math.random,
};

/** Retry-After is seconds or an HTTP date; never shorten a provider's wait. */
export function retryAfterMs(value: string | null, now: number): number | null {
  if (value === null || value.trim() === "") return null;
  const seconds = /^\d+(\.\d+)?$/.test(value.trim()) ? Number(value) : NaN;
  const ms = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(value) - now;
  return Number.isFinite(ms) ? Math.max(0, ms) : null;
}

/** Header-only credentials. Sequential requests keep budget and quota accounting exact. */
export class RapidApiClient {
  private readonly config: RapidApiClientConfig;
  private readonly policy: ProviderResiliencePolicy;
  private readonly fetchImpl: FetchLike;
  private readonly runtime: RetryRuntime;
  private readonly now: () => number;
  private readonly breaker: ProviderCircuitBreaker;
  private lastQuota: ProviderQuota = { limit: null, remaining: null };
  private requestCount = 0;
  private stopped: RapidApiRequestError | null = null;

  constructor(config: RapidApiClientConfig) {
    this.config = config;
    this.policy = { ...RAPIDAPI_POLICY, ...config.policy };
    if (
      !config.key.trim() ||
      !/^[a-z0-9.-]+$/i.test(config.host) ||
      !Number.isInteger(config.minRemaining ?? 100) ||
      (config.minRemaining ?? 100) < 0 ||
      !Number.isInteger(config.maxRequests ?? 100) ||
      (config.maxRequests ?? 100) < 1 ||
      !Number.isInteger(this.policy.maxRetries) ||
      this.policy.maxRetries < 0 ||
      this.policy.maxRetries > 5 ||
      !Number.isFinite(this.policy.timeoutMs) ||
      this.policy.timeoutMs < 1 ||
      !Number.isFinite(this.policy.retryMaxMs) ||
      this.policy.retryMaxMs < 0 ||
      this.policy.retryMaxMs > 60_000
    ) {
      throw new RapidApiRequestError("configuration");
    }
    this.fetchImpl = config.fetch ?? globalThis.fetch.bind(globalThis);
    this.runtime = config.runtime ?? defaultRuntime;
    this.now = config.now ?? Date.now;
    this.breaker = new ProviderCircuitBreaker(
      this.policy.circuitFailureThreshold,
      this.policy.circuitResetMs,
      this.now,
    );
  }

  quota(): ProviderQuota {
    return { ...this.lastQuota };
  }
  requestsSent(): number {
    return this.requestCount;
  }
  stoppedReason(): RapidApiRequestError | null {
    return this.stopped;
  }

  private guard(): void {
    if (this.stopped) throw this.stopped;
    if (this.requestCount >= (this.config.maxRequests ?? 100))
      throw (this.stopped = new RapidApiRequestError("request_budget"));
    // Preserve the reserve, including when the floor is zero (no overage).
    if (
      this.lastQuota.remaining !== null &&
      this.lastQuota.remaining <= (this.config.minRemaining ?? 100)
    )
      throw (this.stopped = new RapidApiRequestError("quota_floor"));
    try {
      this.breaker.assertAvailable();
    } catch {
      throw (this.stopped = new RapidApiRequestError("circuit_open"));
    }
  }

  async getJson(pathAndQuery: string, signal?: AbortSignal): Promise<unknown> {
    // Relative endpoint paths only. Neither secrets nor arbitrary URLs enter diagnostics.
    const path = pathAndQuery.replace(/^\//, "");
    if (
      !/^[a-z0-9/-]+(?:\?[a-z0-9_=&.,%-]+)?$/i.test(path) ||
      /(?:key|token|secret|password)=/i.test(path) ||
      path.includes("..")
    )
      throw new RapidApiRequestError("invalid_path");
    for (let attempt = 0; attempt <= this.policy.maxRetries; attempt++) {
      this.guard();
      if (signal?.aborted) throw new RapidApiRequestError("cancelled");
      const controller = new AbortController();
      const combined = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
      let timedOut = false;
      const timeout = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, this.policy.timeoutMs);
      let onAbort: (() => void) | undefined;
      const deadline = new Promise<never>((_, reject) => {
        onAbort = () => reject(new RapidApiRequestError(timedOut ? "timeout" : "cancelled"));
        combined.addEventListener("abort", onAbort, { once: true });
      });
      let failure: RapidApiRequestError;
      try {
        this.requestCount++;
        const data = await Promise.race([
          deadline,
          (async () => {
            const response = await this.fetchImpl(`https://${this.config.host}/${path}`, {
              headers: {
                "x-rapidapi-key": this.config.key.trim(),
                "x-rapidapi-host": this.config.host,
              },
              signal: combined,
              redirect: "error",
            });
            this.lastQuota = readQuota(response.headers, this.lastQuota);
            const status = response.status;
            if (status < 200 || status >= 300) {
              void response.body?.cancel().catch(() => undefined);
              throw new RapidApiRequestError(
                status === 401
                  ? "authentication"
                  : status === 403
                    ? "access_denied"
                    : status === 429
                      ? "rate_limited"
                      : status === 404
                        ? "upstream_missing"
                        : status >= 500
                          ? "provider_error"
                          : "endpoint_rejected",
                status,
                retryAfterMs(response.headers.get("retry-after"), this.now()),
              );
            }
            let json: unknown;
            try {
              json = await response.json();
            } catch {
              throw new RapidApiRequestError(
                combined.aborted ? (timedOut ? "timeout" : "cancelled") : "invalid_json",
                status,
              );
            }
            const error = (json as { error?: { code?: unknown } } | null)?.error;
            // Api Dojo also returns missing upstream data inside HTTP 200.
            if (error?.code === 404 || error?.code === "404")
              throw new RapidApiRequestError("upstream_missing", status);
            if (error !== undefined) throw new RapidApiRequestError("endpoint_rejected", status);
            return json;
          })(),
        ]);
        this.breaker.success();
        return data;
      } catch (error) {
        failure =
          error instanceof RapidApiRequestError
            ? error
            : new RapidApiRequestError(
                combined.aborted ? (timedOut ? "timeout" : "cancelled") : "network",
              );
      } finally {
        clearTimeout(timeout);
        if (onAbort) combined.removeEventListener("abort", onAbort);
      }
      if (["authentication", "access_denied"].includes(failure.reason)) {
        this.stopped = failure;
        throw failure;
      }
      const retryable = ["rate_limited", "provider_error", "timeout", "network"].includes(
        failure.reason,
      );
      if (!retryable) throw failure;
      if (
        attempt === this.policy.maxRetries ||
        (failure.retryAfterMs ?? 0) > this.policy.retryMaxMs
      ) {
        this.breaker.failure();
        if (
          failure.reason === "rate_limited" ||
          (failure.retryAfterMs ?? 0) > this.policy.retryMaxMs
        )
          this.stopped = failure;
        throw failure;
      }
      this.guard();
      const backoff = Math.min(this.policy.retryMaxMs, this.policy.retryBaseMs * 2 ** attempt);
      const delay = Math.max(
        failure.retryAfterMs ?? 0,
        Math.min(
          this.policy.retryMaxMs,
          backoff + Math.floor(backoff * 0.25 * this.runtime.random()),
        ),
      );
      await this.runtime.sleep(delay);
    }
    throw new RapidApiRequestError("provider_error");
  }
}

export function readQuota(headers: Headers, previous: ProviderQuota): ProviderQuota {
  const read = (name: string): number | null => {
    const raw = headers.get(name);
    if (raw === null || raw.trim() === "") return null;
    const value = Number(raw);
    return Number.isInteger(value) && value >= 0 ? value : null;
  };
  return {
    limit: read("x-ratelimit-requests-limit") ?? previous.limit,
    remaining: read("x-ratelimit-requests-remaining") ?? previous.remaining,
  };
}
