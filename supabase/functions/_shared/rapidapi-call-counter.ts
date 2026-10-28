// Counts the RapidAPI requests of one Edge Function run in the database.
//
// rapidapi-client.ts calls `record` once per request sent (retries included).
// The counter adds them up in memory, by endpoint and HTTP status, and `flush`
// writes the totals with one call to api.service_record_rapidapi_calls
// (migration 20261013110000), after the refresh's own work is done.
//
// Counting must never break or delay a refresh: `record` only touches a Map,
// `flush` never throws, waits at most `timeoutMs` for the database and logs a
// failure as one `rapidapi_count_failed` line. A flush that fails or times out
// loses that run's counts (logged), which can only make the monthly total
// read low, never stop a refresh.
//
// The counter also keeps the smallest `remaining` the provider reported in the
// run (with its `limit` and when it was seen) and, in the same flush, records it
// with api.service_record_rapidapi_quota (migration 20261027100000). The
// database never lets its count fall below limit - remaining, so calls this
// counter missed cannot hide the provider's real usage. That write is as
// isolated as the first: it never throws, waits at most `timeoutMs`, and a
// database without the function yet (the Edge Function deployed first) is
// logged once as `rapidapi_quota_unavailable` and otherwise ignored. Nothing but the endpoint path (no query, no
// id, no key) and a status code is stored.
//
// Dependency-free apart from sibling shared modules.

import type { RapidApiRequestEvent } from "./rapidapi-client.ts";

export const RAPIDAPI_COUNT_TIMEOUT_MS = 2_000;

export interface RapidApiCountClient {
  schema(name: "api"): {
    rpc(
      name: string,
      args: Record<string, unknown>,
    ): PromiseLike<{ error: { message?: string; code?: string } | null }>;
  };
}

export interface RapidApiCallCounter {
  readonly record: (event: RapidApiRequestEvent) => void;
  /** Writes the totals once. Safe to call more than once; never throws. */
  readonly flush: () => Promise<void>;
  /** Requests recorded and not yet flushed. */
  readonly pending: () => number;
}

export interface RapidApiCallCounterOptions {
  readonly client: RapidApiCountClient;
  /**
   * The RapidAPI host the requests go to. The Sofascore host (the default) is
   * recorded with api.service_record_rapidapi_calls / _quota as ever; any other host
   * with the _host_ functions of migration 20261028100000, which count it in its own pool.
   */
  readonly host?: string;
  /** The Edge Function job: `fixtures`, `season_fixtures`, `match_details_backfill`. */
  readonly job: string;
  readonly timeoutMs?: number;
  readonly log?: (line: string) => void;
}

export function createRapidApiCallCounter(
  options: RapidApiCallCounterOptions,
): RapidApiCallCounter {
  const log = options.log ?? ((line: string) => console.log(line));
  const host = options.host;
  const otherHost = host !== undefined && host !== "sofascore.p.rapidapi.com";
  const timeoutMs = options.timeoutMs ?? RAPIDAPI_COUNT_TIMEOUT_MS;
  let totals = new Map<string, { endpoint: string; status: number; calls: number }>();
  let quota: { remaining: number; limit: number; observedAt: string } | null = null;

  const record = (event: RapidApiRequestEvent): void => {
    try {
      const key = `${event.statusCode} ${event.endpoint}`;
      const existing = totals.get(key);
      if (existing) existing.calls += 1;
      else totals.set(key, { endpoint: event.endpoint, status: event.statusCode, calls: 1 });
      const { quotaRemaining: remaining, quotaLimit: limit } = event;
      if (
        typeof remaining === "number" &&
        typeof limit === "number" &&
        Number.isSafeInteger(remaining) &&
        Number.isSafeInteger(limit) &&
        remaining >= 0 &&
        limit > 0 &&
        remaining <= limit &&
        (quota === null || remaining < quota.remaining)
      ) {
        quota = { remaining, limit, observedAt: new Date().toISOString() };
      }
    } catch {
      // Counting must never break a request.
    }
  };

  /** Runs one database write with a time limit; resolves to a failure reason or null. Never throws. */
  const guarded = async (
    write: () => PromiseLike<{ error: { message?: string; code?: string } | null }>,
  ): Promise<string | null> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const done = Promise.resolve(write()).then((result) => {
        if (!result.error) return null;
        const text = `${result.error.code ?? ""} ${result.error.message ?? ""}`;
        return /PGRST202|42883|could not find the function|does not exist/i.test(text)
          ? "function_missing"
          : "database_error";
      });
      const timeout = new Promise<string>((resolve) => {
        timer = setTimeout(() => resolve("timeout"), timeoutMs);
      });
      return await Promise.race([done, timeout]);
    } catch {
      return "database_unavailable";
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  };

  const safeLog = (line: Record<string, unknown>) => {
    try {
      log(JSON.stringify(line));
    } catch {
      // Logging must never break the run either.
    }
  };

  const flush = async (): Promise<void> => {
    const observed = quota;
    quota = null;
    if (totals.size > 0) {
      const batch = [...totals.values()];
      totals = new Map();
      const failure = await guarded(() =>
        options.client
          .schema("api")
          .rpc(otherHost ? "service_record_rapidapi_host_calls" : "service_record_rapidapi_calls", {
            ...(otherHost ? { p_host: host } : {}),
            p_job: options.job,
            p_calls: batch.map((item) => ({
              endpoint: item.endpoint,
              status: item.status,
              calls: item.calls,
            })),
          }),
      );
      if (failure) {
        safeLog({
          event: "rapidapi_count_failed",
          job: options.job,
          reason: failure === "function_missing" ? "database_error" : failure,
          lostCalls: batch.reduce((n, item) => n + item.calls, 0),
        });
      }
    }
    if (observed) {
      const failure = await guarded(() =>
        options.client
          .schema("api")
          .rpc(otherHost ? "service_record_rapidapi_host_quota" : "service_record_rapidapi_quota", {
            ...(otherHost ? { p_host: host } : {}),
            p_remaining: observed.remaining,
            p_limit: observed.limit,
            p_observed_at: observed.observedAt,
          }),
      );
      if (failure) {
        safeLog({
          event:
            failure === "function_missing" ? "rapidapi_quota_unavailable" : "rapidapi_quota_failed",
          job: options.job,
          reason: failure,
        });
      }
    }
  };

  return {
    record,
    flush,
    pending: () => [...totals.values()].reduce((n, item) => n + item.calls, 0),
  };
}
