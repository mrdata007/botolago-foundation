import { FootballError } from "../errors";
import type { ProviderQuota } from "./performance-contracts";
import {
  DEFAULT_PROVIDER_RESILIENCE,
  ProviderCircuitBreaker,
  withProviderResilience,
  type ProviderResiliencePolicy,
  type RetryRuntime,
} from "./resilience";

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface RapidApiClientConfig {
  readonly host: string;
  readonly key: string;
  /** Refuse to send a request once the provider says fewer than this many remain. */
  readonly minRemaining?: number;
  readonly policy?: Partial<ProviderResiliencePolicy>;
  readonly fetch?: FetchLike;
  readonly runtime?: RetryRuntime;
  readonly now?: () => number;
}

/**
 * The monthly plans are 500 requests and a failed call (404, 422) still
 * counts, so only 429, 5xx, timeouts and network errors are retried, and
 * fewer times than the SportMonks default.
 */
const RAPIDAPI_POLICY: ProviderResiliencePolicy = {
  ...DEFAULT_PROVIDER_RESILIENCE,
  timeoutMs: 15_000,
  maxRetries: 2,
};

const DEFAULT_MIN_REMAINING = 100;

/**
 * One RapidAPI host. The key goes in a header only: it is never put in a URL,
 * a log line or an error message, and error messages carry the path and status
 * but never the response body (third-party content).
 */
export class RapidApiClient {
  private readonly host: string;
  private readonly key: string;
  private readonly minRemaining: number;
  private readonly policy: ProviderResiliencePolicy;
  private readonly fetchImpl: FetchLike;
  private readonly runtime: RetryRuntime | undefined;
  private readonly breaker: ProviderCircuitBreaker;
  private lastQuota: ProviderQuota = { limit: null, remaining: null };
  private requestCount = 0;

  constructor(config: RapidApiClientConfig) {
    if (!config.key.trim() || !config.host.trim()) throw configurationError();
    if (!/^[a-z0-9.-]+$/i.test(config.host)) throw configurationError();
    const fetchImpl = config.fetch ?? globalThis.fetch?.bind(globalThis);
    if (!fetchImpl) throw configurationError();
    this.host = config.host.trim();
    this.key = config.key.trim();
    this.minRemaining = config.minRemaining ?? DEFAULT_MIN_REMAINING;
    this.policy = { ...RAPIDAPI_POLICY, ...config.policy };
    this.fetchImpl = fetchImpl;
    this.runtime = config.runtime;
    this.breaker = new ProviderCircuitBreaker(
      this.policy.circuitFailureThreshold,
      this.policy.circuitResetMs,
      config.now,
    );
  }

  /** Quota from the last response. Both null until a request has been made. */
  quota(): ProviderQuota {
    return this.lastQuota;
  }

  /** Requests this client has sent, retries included. */
  requestsSent(): number {
    return this.requestCount;
  }

  async getJson(pathAndQuery: string, signal?: AbortSignal): Promise<unknown> {
    if (/key=/i.test(pathAndQuery)) {
      throw new FootballError("provider_unavailable", "A key must never be placed in a URL.");
    }
    const remaining = this.lastQuota.remaining;
    if (remaining !== null && remaining < this.minRemaining) {
      throw new FootballError(
        "provider_rate_limited",
        `Provider quota is low (${remaining} left): not sending the request.`,
      );
    }
    const path = pathAndQuery.replace(/^\//, "");
    const url = `https://${this.host}/${path}`;

    const response = await withProviderResilience(
      async (timeoutSignal) => {
        // A failed response can exhaust the reserve before the next retry.
        if (this.lastQuota.remaining !== null && this.lastQuota.remaining < this.minRemaining)
          throw new FootballError(
            "provider_rate_limited",
            "Provider quota is low: not retrying the request.",
          );
        this.requestCount += 1;
        const result = await this.fetchImpl(url, {
          headers: { "x-rapidapi-key": this.key, "x-rapidapi-host": this.host },
          signal: signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal,
        });
        this.lastQuota = readQuota(result.headers, this.lastQuota);
        if (result.status === 429) {
          throw new FootballError("provider_rate_limited", `Rate limited on ${path}.`);
        }
        if (result.status >= 500) {
          throw new FootballError("provider_unavailable", `Provider error ${result.status}.`);
        }
        return result;
      },
      this.breaker,
      this.policy,
      this.runtime,
    );

    if (response.status === 401 || response.status === 403) {
      throw new FootballError("provider_unavailable", "The provider refused the credentials.");
    }
    if (response.status === 404) {
      throw new FootballError("data_unavailable", `The provider has no data for ${path}.`);
    }
    if (response.status < 200 || response.status >= 300) {
      throw new FootballError(
        "invalid_provider_payload",
        `The provider rejected ${path} with status ${response.status}.`,
      );
    }
    try {
      return await response.json();
    } catch (error) {
      throw new FootballError(
        "invalid_provider_payload",
        `The response for ${path} is not JSON.`,
        error,
      );
    }
  }
}

export function readQuota(headers: Headers, previous: ProviderQuota): ProviderQuota {
  const read = (name: string): number | null => {
    const raw = headers.get(name);
    if (raw === null) return null;
    const value = Number(raw);
    return Number.isFinite(value) && value >= 0 ? value : null;
  };
  return {
    limit: read("x-ratelimit-requests-limit") ?? previous.limit,
    remaining: read("x-ratelimit-requests-remaining") ?? previous.remaining,
  };
}

function configurationError(): FootballError {
  return new FootballError(
    "provider_unavailable",
    "The RapidAPI server configuration is incomplete or invalid.",
  );
}
