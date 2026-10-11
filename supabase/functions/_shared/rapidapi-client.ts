// RapidAPI client for Edge Functions (SofaScore and Flashscore hosts).
//
// Mirrors src/backend/football/provider/rapidapi-client.ts, rapidapi-config.server.ts
// and resilience.ts. Edge shared code does not import from src/ (it must run
// unchanged under Bun for tests and Deno in the Edge runtime, and src/ uses
// extensionless imports Deno cannot resolve), so the logic is duplicated here
// on purpose. Keep the two in step: same headers, same 15 s timeout, same 2
// retries on 429/5xx/timeout/network only, same quota floor.
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
export const RAPIDAPI_MAX_RETRIES = 2;

export type RapidApiErrorCode =
  | "provider_unavailable"
  | "provider_rate_limited"
  | "invalid_provider_payload"
  | "data_unavailable";

export class RapidApiError extends Error {
  readonly code: RapidApiErrorCode;
  constructor(code: RapidApiErrorCode, message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "RapidApiError";
    this.code = code;
  }
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
  readonly fetch?: FetchLike;
  readonly runtime?: RapidApiRuntime;
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
  private readonly fetchImpl: FetchLike;
  private readonly runtime: RapidApiRuntime;
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
    this.fetchImpl = fetchImpl;
    this.runtime = config.runtime ?? defaultRuntime;
  }

  /** Quota from the last response. Both null until a response has been read. */
  quota(): RapidApiQuota {
    return this.lastQuota;
  }

  requestsSent(): number {
    return this.requestCount;
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
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      const remaining = this.lastQuota.remaining;
      if (remaining !== null && remaining < this.minRemaining) {
        throw new RapidApiError(
          "provider_rate_limited",
          `Provider quota is low (${remaining} left): not sending the request.`,
        );
      }
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        this.requestCount += 1;
        const result = await this.fetchImpl(url, {
          headers: { "x-rapidapi-key": this.key, "x-rapidapi-host": this.host },
          signal: controller.signal,
        });
        this.lastQuota = readQuota(result.headers, this.lastQuota);
        if (result.status === 429) {
          throw new RapidApiError("provider_rate_limited", `Rate limited on ${path}.`);
        }
        if (result.status >= 500) {
          throw new RapidApiError("provider_unavailable", `Provider error ${result.status}.`);
        }
        return result;
      } catch (error) {
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
        if (attempt === this.maxRetries) throw lastError;
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
  "fetch" | "runtime" | "timeoutMs" | "maxRetries" | "minRemaining"
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
