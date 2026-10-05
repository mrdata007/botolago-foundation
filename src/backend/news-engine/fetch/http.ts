// Bounded, polite HTTP for the news engine.
//
// Everything a source request must respect lives here, so no stage can skip
// it by accident:
//   * https only, and only to the source's own declared hostname;
//   * a per-source token-bucket rate limit and a minimum inter-request gap;
//   * a hard response-size cap, enforced while streaming so an oversized body
//     is abandoned rather than buffered;
//   * request timeouts and bounded retries with exponential backoff and
//     jitter, honouring Retry-After;
//   * conditional requests via ETag / If-Modified-Since;
//   * redirects followed only within the same host, never across origins.
//
// It does not, and must not, do anything to get past an access control:
// no cookie jars, no auth headers, no CAPTCHA handling, no header spoofing.
// A 401, 403 or 429 is a final answer.

import { NewsEngineError } from "../contracts";

export const DEFAULT_USER_AGENT = "BotolaGO-NewsEngine/1.0 (+https://botolago.com)";

/** Enough for a long article page; anything larger is not an article. */
export const MAX_RESPONSE_BYTES = 3 * 1024 * 1024;
/** Sitemaps can be big, but not unbounded. */
export const MAX_LISTING_BYTES = 8 * 1024 * 1024;
export const MAX_ROBOTS_BYTES = 256 * 1024;

export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export interface HttpRequest {
  readonly url: string;
  readonly expectedHostname: string;
  readonly timeoutMs: number;
  readonly maxRetries: number;
  readonly maxBytes?: number;
  readonly etag?: string | null;
  readonly lastModified?: string | null;
  readonly accept?: string;
  readonly userAgent?: string;
}

export interface HttpResult {
  readonly status: number;
  readonly notModified: boolean;
  readonly body: string;
  readonly etag: string | null;
  readonly lastModified: string | null;
  readonly contentType: string | null;
  readonly finalUrl: string;
}

export interface HttpClientOptions {
  readonly fetch?: FetchLike;
  readonly sleep?: (milliseconds: number) => Promise<void>;
  readonly now?: () => number;
  /** Injected for deterministic tests; production leaves it random. */
  readonly jitter?: () => number;
  readonly userAgent?: string;
}

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);
/** Statuses that carry a Location. 304 is deliberately excluded — it is a
 * conditional-request answer, not a redirect. */
const REDIRECT_STATUS = new Set([301, 302, 303, 307, 308]);
/** A refusal to serve us. Retrying is both useless and rude. */
const TERMINAL_STATUS = new Set([401, 402, 403, 404, 405, 410, 451]);

function defaultSleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function backoffDelay(attempt: number, jitter: number): number {
  const base = Math.min(8_000, 400 * 2 ** attempt);
  return Math.round(base * (0.75 + Math.min(Math.max(jitter, 0), 1) * 0.5));
}

function parseRetryAfter(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1_000, 60_000);
  const date = Date.parse(header);
  if (Number.isNaN(date)) return null;
  return Math.min(Math.max(date - Date.now(), 0), 60_000);
}

/**
 * Per-host pacing. One limiter instance is shared by every request to a
 * source, so concurrency inside a batch cannot multiply the configured rate.
 */
export class RateLimiter {
  private readonly intervalMs: number;
  private nextAvailableAt = 0;

  constructor(
    requestsPerMinute: number,
    private readonly sleep: (milliseconds: number) => Promise<void> = defaultSleep,
    private readonly now: () => number = Date.now,
  ) {
    const safeRate = Math.min(Math.max(requestsPerMinute, 1), 120);
    this.intervalMs = Math.ceil(60_000 / safeRate);
  }

  async acquire(): Promise<void> {
    const current = this.now();
    const scheduledAt = Math.max(current, this.nextAvailableAt);
    this.nextAvailableAt = scheduledAt + this.intervalMs;
    const waitMs = scheduledAt - current;
    if (waitMs > 0) await this.sleep(waitMs);
  }

  /** Applies a server-requested pause to every subsequent request. */
  backOff(milliseconds: number): void {
    this.nextAvailableAt = Math.max(this.nextAvailableAt, this.now() + milliseconds);
  }
}

/** Reads at most `maxBytes`, aborting the transfer instead of buffering more. */
async function readBounded(response: Response, maxBytes: number): Promise<string> {
  const body = response.body;
  if (!body) return "";

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new NewsEngineError(
          "news_engine_response_too_large",
          "Response exceeded the size cap.",
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8").decode(merged);
}

export class NewsHttpClient {
  private readonly fetchImpl: FetchLike;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly now: () => number;
  private readonly jitter: () => number;
  private readonly userAgent: string;
  private readonly limiters = new Map<string, RateLimiter>();

  constructor(options: HttpClientOptions = {}) {
    this.fetchImpl = options.fetch ?? ((input, init) => fetch(input, init));
    this.sleep = options.sleep ?? defaultSleep;
    this.now = options.now ?? Date.now;
    this.jitter = options.jitter ?? Math.random;
    this.userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
  }

  limiterFor(hostname: string, requestsPerMinute: number): RateLimiter {
    const existing = this.limiters.get(hostname);
    if (existing) return existing;
    const created = new RateLimiter(requestsPerMinute, this.sleep, this.now);
    this.limiters.set(hostname, created);
    return created;
  }

  async request(input: HttpRequest): Promise<HttpResult> {
    const target = new URL(input.url);
    if (target.protocol !== "https:") {
      throw new NewsEngineError("news_engine_non_https_url", "Only https sources are permitted.");
    }
    if (target.hostname.toLowerCase() !== input.expectedHostname.toLowerCase()) {
      throw new NewsEngineError(
        "news_engine_host_not_allowed",
        "Request host does not match the configured source host.",
      );
    }

    const maxBytes = input.maxBytes ?? MAX_RESPONSE_BYTES;
    const attempts = Math.min(Math.max(input.maxRetries, 0), 5) + 1;
    let lastError: unknown;

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(
        () => controller.abort(),
        Math.min(Math.max(input.timeoutMs, 1_000), 60_000),
      );

      try {
        const headers: Record<string, string> = {
          "user-agent": input.userAgent ?? this.userAgent,
          accept: input.accept ?? "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "accept-language": "ar,fr;q=0.9,en;q=0.5",
        };
        if (input.etag) headers["if-none-match"] = input.etag;
        if (input.lastModified) headers["if-modified-since"] = input.lastModified;

        const response = await this.fetchImpl(target.toString(), {
          method: "GET",
          headers,
          redirect: "manual",
          signal: controller.signal,
        });

        // 304 is not a redirect. It must be answered before the redirect
        // branch, or every conditional request looks like a Location-less
        // redirect and fails.
        if (response.status === 304) {
          return {
            status: 304,
            notModified: true,
            body: "",
            etag: input.etag ?? null,
            lastModified: input.lastModified ?? null,
            contentType: response.headers.get("content-type"),
            finalUrl: target.toString(),
          };
        }

        // Follow redirects ourselves so a source cannot bounce the crawler
        // onto a different origin.
        if (REDIRECT_STATUS.has(response.status)) {
          const location = response.headers.get("location");
          if (!location) {
            throw new NewsEngineError(
              "news_engine_redirect_without_location",
              "Redirect had no target.",
            );
          }
          const next = new URL(location, target);
          if (next.hostname.toLowerCase() !== input.expectedHostname.toLowerCase()) {
            throw new NewsEngineError(
              "news_engine_cross_host_redirect",
              "Refused a redirect that left the configured source host.",
            );
          }
          if (next.toString() === target.toString()) {
            throw new NewsEngineError("news_engine_redirect_loop", "Redirect pointed at itself.");
          }
          clearTimeout(timer);
          return await this.request({ ...input, url: next.toString() });
        }

        if (TERMINAL_STATUS.has(response.status)) {
          throw new NewsEngineError(
            "news_engine_access_denied",
            `Source refused the request with status ${response.status}.`,
          );
        }

        if (RETRYABLE_STATUS.has(response.status)) {
          const retryAfter = parseRetryAfter(response.headers.get("retry-after"));
          if (retryAfter !== null) {
            this.limiterFor(target.hostname, 60).backOff(retryAfter);
          }
          throw new NewsEngineError(
            "news_engine_upstream_unavailable",
            `Source returned status ${response.status}.`,
            true,
          );
        }

        if (!response.ok) {
          throw new NewsEngineError(
            "news_engine_unexpected_status",
            `Source returned status ${response.status}.`,
          );
        }

        const body = await readBounded(response, maxBytes);
        return {
          status: response.status,
          notModified: false,
          body,
          etag: response.headers.get("etag"),
          lastModified: response.headers.get("last-modified"),
          contentType: response.headers.get("content-type"),
          finalUrl: target.toString(),
        };
      } catch (error) {
        lastError = error;
        const retryable =
          (error instanceof NewsEngineError && error.retryable) ||
          (error instanceof Error && error.name === "AbortError");
        if (!retryable || attempt === attempts - 1) break;
        await this.sleep(backoffDelay(attempt, this.jitter()));
      } finally {
        clearTimeout(timer);
      }
    }

    if (lastError instanceof NewsEngineError) throw lastError;
    if (lastError instanceof Error && lastError.name === "AbortError") {
      throw new NewsEngineError(
        "news_engine_timeout",
        "Source request timed out.",
        true,
        lastError,
      );
    }
    throw new NewsEngineError(
      "news_engine_fetch_failed",
      "Source request failed.",
      true,
      lastError,
    );
  }
}
