// Reads the RapidAPI monthly budget for the guard in rapidapi-client.ts.
//
// api.service_rapidapi_budget (migration 20261026143000) answers with the calls
// counted in the current quota window (app_private.rapidapi_call_counts plus
// the owner's offset), the soft and the hard limit. The Edge Function reads it
// once per run, before the first provider call; the client adds the run's own
// requests on top. A read that fails returns null and is logged: the caller
// then fails closed (football-live-refresh.ts UNREADABLE_BUDGET: essential
// endpoints only).
//
// Dependency-free apart from sibling shared modules.

import type { RapidApiBudget } from "./rapidapi-client.ts";

export interface RapidApiBudgetClient {
  schema(name: "api"): {
    rpc(
      name: string,
      args: Record<string, unknown>,
    ): PromiseLike<{ data: unknown; error: { message?: string } | null }>;
  };
}

export interface RapidApiBudgetReading extends RapidApiBudget {
  /** First day (UTC) of the quota window the count covers. */
  readonly windowStart: string | null;
  /** Seconds between live polls as the database has them (60 unless stretched). */
  readonly liveIntervalSeconds: number;
}

function whole(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

export async function loadRapidApiBudget(
  client: RapidApiBudgetClient,
  job: string,
  log: (line: string) => void = (line) => console.log(line),
): Promise<RapidApiBudgetReading | null> {
  const failed = (reason: string): null => {
    try {
      log(JSON.stringify({ event: "rapidapi_budget_unavailable", job, reason }));
    } catch {
      // Logging must never break the run.
    }
    return null;
  };
  try {
    const result = await client.schema("api").rpc("service_rapidapi_budget", {});
    if (result.error) return failed("database_error");
    const data = result.data;
    if (typeof data !== "object" || data === null) return failed("unreadable");
    const record = data as Record<string, unknown>;
    const used = whole(record.used);
    const softLimit = whole(record.softLimit);
    const hardLimit = whole(record.hardLimit);
    if (used === null || softLimit === null || hardLimit === null) return failed("unreadable");
    return {
      used,
      softLimit,
      hardLimit,
      windowStart: typeof record.windowStart === "string" ? record.windowStart : null,
      liveIntervalSeconds: (() => {
        const seconds = whole(record.liveIntervalSeconds);
        return seconds !== null && seconds >= 60 && seconds <= 300 ? seconds : 60;
      })(),
    };
  } catch {
    return failed("database_unavailable");
  }
}
