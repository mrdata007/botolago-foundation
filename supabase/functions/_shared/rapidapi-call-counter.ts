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
// read low, never stop a refresh. Nothing but the endpoint path (no query, no
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
    ): PromiseLike<{ error: { message?: string } | null }>;
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
  /** The Edge Function job: `fixtures`, `season_fixtures`, `match_details_backfill`. */
  readonly job: string;
  readonly timeoutMs?: number;
  readonly log?: (line: string) => void;
}

export function createRapidApiCallCounter(
  options: RapidApiCallCounterOptions,
): RapidApiCallCounter {
  const log = options.log ?? ((line: string) => console.log(line));
  const timeoutMs = options.timeoutMs ?? RAPIDAPI_COUNT_TIMEOUT_MS;
  let totals = new Map<string, { endpoint: string; status: number; calls: number }>();

  const record = (event: RapidApiRequestEvent): void => {
    try {
      const key = `${event.statusCode} ${event.endpoint}`;
      const existing = totals.get(key);
      if (existing) existing.calls += 1;
      else totals.set(key, { endpoint: event.endpoint, status: event.statusCode, calls: 1 });
    } catch {
      // Counting must never break a request.
    }
  };

  const flush = async (): Promise<void> => {
    if (totals.size === 0) return;
    const batch = [...totals.values()];
    totals = new Map();
    const fail = (reason: string) => {
      try {
        log(
          JSON.stringify({
            event: "rapidapi_count_failed",
            job: options.job,
            reason,
            lostCalls: batch.reduce((n, item) => n + item.calls, 0),
          }),
        );
      } catch {
        // Logging must never break the run either.
      }
    };
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const write = Promise.resolve(
        options.client.schema("api").rpc("service_record_rapidapi_calls", {
          p_job: options.job,
          p_calls: batch.map((item) => ({
            endpoint: item.endpoint,
            status: item.status,
            calls: item.calls,
          })),
        }),
      ).then((result) => (result.error ? "database_error" : null));
      const timeout = new Promise<string>((resolve) => {
        timer = setTimeout(() => resolve("timeout"), timeoutMs);
      });
      const failure = await Promise.race([write, timeout]);
      if (failure) fail(failure);
    } catch {
      fail("database_unavailable");
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  };

  return {
    record,
    flush,
    pending: () => [...totals.values()].reduce((n, item) => n + item.calls, 0),
  };
}
