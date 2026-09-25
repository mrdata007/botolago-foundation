import { QueryCache, QueryClient, type QueryMeta } from "@tanstack/react-query";

import { isMfaStepUpError, reportMfaStepUp } from "@/backend/auth/step-up";
import { BackendError } from "@/backend/errors";

/**
 * One retry, not React Query's default three. On 2026-09-24 every page asked
 * four times with back-off while the database was starved, which multiplied
 * the load that was starving it and kept visitors on skeletons for a minute
 * or more. One retry absorbs a dropped connection; after that the page shows
 * its error state and its own "retry" button.
 */
export const MAX_QUERY_RETRIES = 1;

// Refusals that a second attempt cannot change: the thing does not exist, the
// visitor may not see it, or the request itself is malformed.
const FINAL_CODE = /not_found|unauthori[sz]ed|forbidden|invalid|unsupported/;

export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  if (failureCount >= MAX_QUERY_RETRIES) return false;
  // Refused until the one-time code is in (`PT403 mfa_required`): asking again
  // gets the same answer.
  if (isMfaStepUpError(error)) return false;
  if (error instanceof BackendError) return error.retryable || error.status >= 500;
  const code = (error as { code?: unknown } | null)?.code;
  if (typeof code === "string" && FINAL_CODE.test(code)) return false;
  return true;
}

/** About a second, spread so the tabs a failure hit do not retry in step. */
export function queryRetryDelay(attempt: number, random: () => number = Math.random): number {
  return Math.round(Math.min(1_000 * 2 ** attempt, 8_000) * (0.5 + random()));
}

/**
 * A staff screen's query says so with this meta. Staff MFA has its own states
 * and screens, and its RPCs use `mfa_required` for "no factor enrolled" (see
 * `@/backend/auth/step-up`), so their refusals must not reach the reader's
 * challenge.
 */
export const STAFF_MFA_QUERY_META = { staffMfa: true } as const satisfies QueryMeta;

/**
 * Every read the app makes through React Query, refused for want of the
 * one-time code, goes where a refused write goes: to the auth layer, which
 * says so and re-reads the session (a factor enrolled on another device is
 * only listed in a new token), and takes the reader to the challenge when the
 * code is owed. The database refuses those reads since 20260926003100. Most
 * domain mappers already report on their way through; this also covers the
 * reads whose mapper does not, and the listener collapses repeats. Without it,
 * a page read refused this way showed its generic error and nothing else.
 */
export function reportRefusedQuery(error: unknown, query: { meta?: QueryMeta }): void {
  if (query.meta?.staffMfa === true) return;
  reportMfaStepUp(error);
}

/**
 * The season list (`api.football_season_catalog`) changes once a season, yet
 * Home, Matches, Standings and every club page read it under the 15-second
 * default: 2,661 reads on 2026-09-24. Ten minutes covers a visit.
 */
export const SEASON_CATALOG_STALE_MS = 10 * 60_000;

export function createAppQueryClient() {
  const client = new QueryClient({
    queryCache: new QueryCache({ onError: reportRefusedQuery }),
    defaultOptions: {
      queries: {
        // Avoid reloading the same home and football data on quick route
        // changes. Mutations invalidate affected queries; match data still
        // refreshes on focus once this short window has elapsed.
        staleTime: 15_000,
        retry: shouldRetryQuery,
        retryDelay: (attempt) => queryRetryDelay(attempt),
      },
    },
  });
  client.setQueryDefaults(["football", "seasons"], { staleTime: SEASON_CATALOG_STALE_MS });
  return client;
}
