// RapidAPI client for Edge Functions (SofaScore and Flashscore hosts).
//
// Mirrors src/backend/football/provider/rapidapi-client.ts, rapidapi-config.server.ts
// and resilience.ts. Edge shared code does not import from src/ (it must run
// unchanged under Bun for tests and Deno in the Edge runtime, and src/ uses
// extensionless imports Deno cannot resolve), so the logic is duplicated here
// on purpose. Keep the two in step: same headers, same 15 s timeout, same quota
// floor. This copy differs on purpose in two ways: it retries 5xx, timeouts and
// network errors only (a 429 is never sent again: every try is a counted call),
// and it enforces the monthly budget (see `RapidApiBudget`).
//
// The key goes in headers only. It is never put in a URL, a log line or an
// error message, and error messages carry the path and status but never the
// response body (third-party content).
//
// Dependency-free: no Deno global is read here. The caller passes
// `Deno.env.toObject()` as `environment`.

export const SOFASCORE_RAPIDAPI_HOST = "sofascore.p.rapidapi.com";
export const DEFAULT_MIN_REMAINING = 100;
export const RAPIDAPI_TIMEOUT_MS = 15_000;
/**
 * Retries per request, for ESSENTIAL_ENDPOINTS only. Every try is a billed call
 * and a timed-out request is billed too, so any other endpoint is sent once: the
 * next tick asks again anyway.
 */
export const RAPIDAPI_MAX_RETRIES = 1;

/** Endpoints that still run above the soft limit: the live score feed and the incidents of a match. */
export const ESSENTIAL_ENDPOINTS: ReadonlySet<string> = new Set([
  "tournaments/get-live-events",
  "matches/get-incidents",
]);

export type RapidApiErrorCode =
  | "provider_unavailable"
  | "provider_rate_limited"
  | "invalid_provider_payload"
  | "data_unavailable";

export class RapidApiError extends Error {
  readonly code: RapidApiErrorCode;
  /** Set when the monthly budget guard refused the request, not the provider. */
  readonly budget?: "soft_limit" | "hard_limit";
  constructor(
    code: RapidApiErrorCode,
    message: string,
    cause?: unknown,
    budget?: "soft_limit" | "hard_limit",
  ) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "RapidApiError";
    this.code = code;
    if (budget) this.budget = budget;
  }
}

/**
 * The month's budget at the start of a run (api.service_rapidapi_budget):
 * calls counted in the current quota window, before this run's own. Above
 * `softLimit` only ESSENTIAL_ENDPOINTS are sent; at `hardLimit` nothing is.
 * The run's own requests are added on top, retries included.
 */
export interface RapidApiBudget {
  readonly used: number;
  readonly softLimit: number;
  readonly hardLimit: number;
}

export interface RapidApiQuota {
  readonly limit: number | null;
  readonly remaining: number | null;
}

export interface RapidApiResult {
  readonly data: unknown;
  /** Quota as of this response, for the job to log. */
  readonly quota: RapidApiQuota;
  /** Requests this client has sent so far, retries included. */
  readonly requestsSent: number;
}

/** One request that left for the provider (a retry is another one). */
export interface RapidApiRequestEvent {
  /** The path without its query string, e.g. `matches/get-incidents`. */
  readonly endpoint: string;
  /** HTTP status of the answer, or 0 when there was none (network error, timeout). */
  readonly statusCode: number;
  /**
   * The quota the provider reported on this answer (`x-ratelimit-requests-*`).
   * Present only when the answer carried the header; the counter keeps the
   * smallest `quotaRemaining` of a run as the provider's own figure.
   */
  readonly quotaRemaining?: number;
  readonly quotaLimit?: number;
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface RapidApiRuntime {
  readonly sleep: (milliseconds: number) => Promise<void>;
  readonly random: () => number;
}

export interface RapidApiClientConfig {
  readonly host: string;
  readonly key: string;
  /** Hosts a client may be created for. Defaults to SofaScore only. */
  readonly allowedHosts?: readonly string[];
  /** Refuse to send once the provider says fewer than this many remain. */
  readonly minRemaining?: number;
  readonly timeoutMs?: number;
  readonly maxRetries?: number;
  /**
   * Endpoints that stay allowed above the soft limit and that may be retried.
   * Defaults to ESSENTIAL_ENDPOINTS; the rating polls add `matches/get-lineups`.
   */
  readonly essentialEndpoints?: ReadonlySet<string>;
  /** The monthly budget guard; none when absent (tests, scripts). */
  readonly budget?: RapidApiBudget;
  readonly fetch?: FetchLike;
  readonly runtime?: RapidApiRuntime;
  /**
   * Called once per request sent, retries included, for the call counter. It
   * must be cheap and is isolated: a throw is swallowed, so counting can never
   * break or delay a request.
   */
  readonly onRequest?: (event: RapidApiRequestEvent) => void;
}

const defaultRuntime: RapidApiRuntime = {
  sleep: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  random: Math.random,
};

const RETRY_BASE_MS = 250;
const RETRY_MAX_MS = 5_000;

export class RapidApiClient {
  private readonly host: string;
  private readonly key: string;
  private readonly minRemaining: number;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly budget: RapidApiBudget | undefined;
  private readonly essential: ReadonlySet<string>;
  private readonly fetchImpl: FetchLike;
  private readonly runtime: RapidApiRuntime;
  private readonly onRequest: ((event: RapidApiRequestEvent) => void) | undefined;
  private lastQuota: RapidApiQuota = { limit: null, remaining: null };
  private requestCount = 0;

  constructor(config: RapidApiClientConfig) {
    const host = config.host.trim().toLowerCase();
    const key = config.key.trim();
    if (!key || !host || !/^[a-z0-9.-]+$/.test(host)) throw configurationError();
    const allowed = (config.allowedHosts ?? [SOFASCORE_RAPIDAPI_HOST]).map((value) =>
      value.trim().toLowerCase(),
    );
    if (!allowed.includes(host)) throw configurationError();
    const fetchImpl = config.fetch ?? globalThis.fetch?.bind(globalThis);
    if (!fetchImpl) throw configurationError();
    this.host = host;
    this.key = key;
    this.minRemaining = config.minRemaining ?? DEFAULT_MIN_REMAINING;
    this.timeoutMs = config.timeoutMs ?? RAPIDAPI_TIMEOUT_MS;
    this.maxRetries = config.maxRetries ?? RAPIDAPI_MAX_RETRIES;
    this.budget = config.budget;
    this.essential = config.essentialEndpoints ?? ESSENTIAL_ENDPOINTS;
    this.fetchImpl = fetchImpl;
    this.runtime = config.runtime ?? defaultRuntime;
    this.onRequest = config.onRequest;
  }

  private count(path: string, statusCode: number, quota?: RapidApiQuota): void {
    if (!this.onRequest) return;
    try {
      this.onRequest({
        endpoint: endpointOf(path),
        statusCode,
        ...(quota && quota.remaining !== null && quota.limit !== null
          ? { quotaRemaining: quota.remaining, quotaLimit: quota.limit }
          : {}),
      });
    } catch {
      // Counting must never break a request.
    }
  }

  /** Quota from the last response. Both null until a response has been read. */
  quota(): RapidApiQuota {
    return this.lastQuota;
  }

  requestsSent(): number {
    return this.requestCount;
  }

  /** The error to throw instead of sending `path`, or null when the budget allows it. */
  private budgetRefusal(path: string): RapidApiError | null {
    const budget = this.budget;
    if (!budget) return null;
    // Our own count (the database's, plus this run's requests) or, when higher,
    // what the provider itself says it has used: limit - remaining of the last
    // reply. The provider's figure is the floor, as it is in the database.
    const providerUsed =
      this.lastQuota.limit !== null && this.lastQuota.remaining !== null
        ? Math.max(0, this.lastQuota.limit - this.lastQuota.remaining)
        : 0;
    const used = Math.max(budget.used + this.requestCount, providerUsed);
    if (used >= budget.hardLimit) {
      return new RapidApiError(
        "provider_rate_limited",
        `Monthly RapidAPI budget reached (${used} of ${budget.hardLimit}): not sending the request.`,
        undefined,
        "hard_limit",
      );
    }
    if (used >= budget.softLimit && !this.essential.has(endpointOf(path))) {
      return new RapidApiError(
        "provider_rate_limited",
        `Monthly RapidAPI soft limit reached (${used} of ${budget.softLimit}): only live calls are sent.`,
        undefined,
        "soft_limit",
      );
    }
    return null;
  }

  async getJson(pathAndQuery: string): Promise<RapidApiResult> {
    if (/key=/i.test(pathAndQuery)) {
      throw new RapidApiError("provider_unavailable", "A key must never be placed in a URL.");
    }
    const remaining = this.lastQuota.remaining;
    if (remaining !== null && remaining < this.minRemaining) {
      throw new RapidApiError(
        "provider_rate_limited",
        `Provider quota is low (${remaining} left): not sending the request.`,
      );
    }
    const path = pathAndQuery.replace(/^\//, "");
    const refused = this.budgetRefusal(path);
    if (refused) throw refused;
    const url = `https://${this.host}/${path}`;

    const response = await this.sendWithRetries(url, path);

    if (response.status === 401 || response.status === 403) {
      throw new RapidApiError("provider_unavailable", "The provider refused the credentials.");
    }
    if (response.status === 404) {
      throw new RapidApiError("data_unavailable", `The provider has no data for ${path}.`);
    }
    if (response.status < 200 || response.status >= 300) {
      throw new RapidApiError(
        "invalid_provider_payload",
        `The provider rejected ${path} with status ${response.status}.`,
      );
    }
    let data: unknown;
    try {
      data = await response.json();
    } catch (error) {
      throw new RapidApiError(
        "invalid_provider_payload",
        `The response for ${path} is not JSON.`,
        error,
      );
    }
    return { data, quota: this.lastQuota, requestsSent: this.requestCount };
  }

  private async sendWithRetries(url: string, path: string): Promise<Response> {
    let lastError: RapidApiError | undefined;
    const maxRetries = this.essential.has(endpointOf(path)) ? this.maxRetries : 0;
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      const remaining = this.lastQuota.remaining;
      if (remaining !== null && remaining < this.minRemaining) {
        throw new RapidApiError(
          "provider_rate_limited",
          `Provider quota is low (${remaining} left): not sending the request.`,
        );
      }
      if (attempt > 0) {
        const refused = this.budgetRefusal(path);
        if (refused) throw refused;
      }
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
      let counted = false;
      try {
        this.requestCount += 1;
        const result = await this.fetchImpl(url, {
          headers: { "x-rapidapi-key": this.key, "x-rapidapi-host": this.host },
          signal: controller.signal,
        });
        counted = true;
        // The guard keeps the last figure the run saw; the count gets only the
        // figure this answer carried, so a reply without the headers never
        // passes an earlier figure off as a fresh one.
        const answered = readQuota(result.headers, { limit: null, remaining: null });
        this.lastQuota = readQuota(result.headers, this.lastQuota);
        this.count(path, result.status, answered);
        if (result.status === 429) {
          throw new RapidApiError("provider_rate_limited", `Rate limited on ${path}.`);
        }
        if (result.status >= 500) {
          throw new RapidApiError("provider_unavailable", `Provider error ${result.status}.`);
        }
        return result;
      } catch (error) {
        // No answer at all (network error, timeout): counted with status 0.
        if (!counted) this.count(path, 0);
        // A network error or abort is wrapped without copying its message:
        // it could echo the URL or headers.
        lastError =
          error instanceof RapidApiError
            ? error
            : new RapidApiError(
                "provider_unavailable",
                controller.signal.aborted
                  ? "The provider request timed out."
                  : "The provider request failed.",
              );
        // A 429 is never sent again: the retry would only spend another call.
        if (lastError.code === "provider_rate_limited" || attempt === maxRetries) {
          throw lastError;
        }
        const exponential = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** attempt);
        const jitter = Math.floor(exponential * 0.25 * this.runtime.random());
        await this.runtime.sleep(exponential + jitter);
      } finally {
        clearTimeout(timeout);
      }
    }
    throw lastError ?? configurationError();
  }
}

/** The request path without its query string or leading slash. */
export function endpointOf(pathAndQuery: string): string {
  return pathAndQuery.replace(/^\//, "").split("?")[0].split("#")[0];
}

export function readQuota(headers: Headers, previous: RapidApiQuota): RapidApiQuota {
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

type Environment = Readonly<Record<string, string | undefined>>;
type ClientOverrides = Pick<
  RapidApiClientConfig,
  | "fetch"
  | "runtime"
  | "timeoutMs"
  | "maxRetries"
  | "minRemaining"
  | "onRequest"
  | "budget"
  | "essentialEndpoints"
>;

/**
 * Build a client from the environment (pass `Deno.env.toObject()`):
 * `RAPIDAPI_KEY`, `SOFASCORE_MIN_REMAINING` (default 100) and, for Flashscore,
 * `FLASHSCORE_RAPIDAPI_HOST`. Only those two hosts are allowed.
 */
export function createRapidApiClient(
  provider: "sofascore" | "flashscore",
  environment: Environment,
  overrides: ClientOverrides = {},
): RapidApiClient {
  const key = environment.RAPIDAPI_KEY?.trim();
  if (!key) throw configurationError();
  const flashscoreHost = environment.FLASHSCORE_RAPIDAPI_HOST?.trim();
  const host = provider === "sofascore" ? SOFASCORE_RAPIDAPI_HOST : flashscoreHost;
  if (!host) throw configurationError();
  const allowedHosts = flashscoreHost
    ? [SOFASCORE_RAPIDAPI_HOST, flashscoreHost]
    : [SOFASCORE_RAPIDAPI_HOST];
  return new RapidApiClient({
    host,
    key,
    allowedHosts,
    minRemaining: parseMinRemaining(environment.SOFASCORE_MIN_REMAINING),
    ...overrides,
  });
}

function parseMinRemaining(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === "") return DEFAULT_MIN_REMAINING;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) throw configurationError();
  return value;
}

function configurationError(): RapidApiError {
  return new RapidApiError(
    "provider_unavailable",
    "The RapidAPI server configuration is incomplete or invalid.",
  );
}
