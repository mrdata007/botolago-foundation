// Phase 3B2a — Fantasy owned-data source selector + query key helpers.
//
// Contract:
//   - Auth mode = supabase AND user is authenticated  → "cloud"
//   - Supabase mode + anonymous                           → "guest"
//   - Mock auth mode                                     → "local"
// No runtime fallback from cloud to local. Cloud failures surface as
// FantasyCloudError; the UI decides whether to retry or keep working local
// state as read-only until the user reloads.
//
// Every "owned" query key is scoped by the current user id (or the "local"
// pseudo-owner) so switching accounts / signing out cannot leak another
// user's cached data. `clearOwnedFantasyCache` removes exactly those keys.

import { useMemo } from "react";
import type { QueryClient } from "@tanstack/react-query";
import { AUTH_MODE } from "@/services/auth";
import { useAuth } from "@/auth/AuthProvider";

export type FantasyDataSource = "cloud" | "guest" | "local";

export function selectFantasyDataSource(input: {
  authMode: "supabase" | "mock";
  isAuthenticated: boolean;
}): FantasyDataSource {
  if (input.authMode === "supabase" && input.isAuthenticated) return "cloud";
  if (input.authMode === "supabase") return "guest";
  return "local";
}

const LOCAL_OWNER = "__local__";
export const OWNED_FANTASY_KEY_ROOT = "owned-fantasy";

export interface FantasyKeyScope {
  source: FantasyDataSource;
  owner: string;
}

export function scopedFantasyKey(
  scope: FantasyKeyScope,
  ...rest: ReadonlyArray<string | number | null | undefined>
): ReadonlyArray<unknown> {
  return [OWNED_FANTASY_KEY_ROOT, scope.source, scope.owner, ...rest];
}

/** True when a react-query cache key is one of ours. */
export function isOwnedFantasyKey(key: unknown): boolean {
  return Array.isArray(key) && key[0] === OWNED_FANTASY_KEY_ROOT;
}

/** True when a cache key is one of ours and belongs to `scope`'s owner. */
export function belongsToFantasyScope(key: unknown, scope: FantasyKeyScope): boolean {
  return (
    isOwnedFantasyKey(key) &&
    (key as readonly unknown[])[1] === scope.source &&
    (key as readonly unknown[])[2] === scope.owner
  );
}

/**
 * `placeholderData` for an owned query: the previous key's data stays on
 * screen while the next key loads -- the rankings' next page, another sort --
 * but only when that previous key was `scope`'s too.
 *
 * `keepPreviousData` keeps whatever the observer last showed, whoever it
 * belonged to. After a switch from account A to B, the rankings kept A's
 * page -- A's team, rank and points, highlighted as "me" -- on B's screen
 * until B's board arrived, and removing A's queries could not help: the
 * observer holds its last data itself. A new function per scope, so TanStack
 * Query does not reuse the placeholder it computed for the last one.
 */
export function keepSameOwnerData(scope: FantasyKeyScope) {
  return <T>(previous: T | undefined, previousQuery?: { queryKey: readonly unknown[] }) =>
    previousQuery && belongsToFantasyScope(previousQuery.queryKey, scope) ? previous : undefined;
}

/**
 * Remove every owned-fantasy cache entry except `current`'s. On an identity
 * change the previous owner's data must go, but the current owner's queries
 * were created by the very render that changed the identity: removing one
 * also cancels its first fetch, and its observer is left waiting on a query
 * that no longer exists, so the Fantasy screens stayed on their loading
 * placeholders (every time in Arabic, found 2026-09-24).
 */
export function clearOtherOwnersFantasyCache(qc: QueryClient, current: FantasyKeyScope): void {
  qc.removeQueries({
    predicate: (q) => isOwnedFantasyKey(q.queryKey) && !belongsToFantasyScope(q.queryKey, current),
  });
}

/**
 * Remove every owned-fantasy cache entry (all sources, all owners).
 * Used on sign-out so the next signed-in user starts clean.
 */
export function clearOwnedFantasyCache(qc: QueryClient): void {
  qc.removeQueries({ predicate: (q) => isOwnedFantasyKey(q.queryKey) });
}

/** React hook for routes: current source + a scoped-key helper. */
export function useFantasyDataSource(): {
  source: FantasyDataSource;
  scope: FantasyKeyScope;
  key: (...rest: ReadonlyArray<string | number | null | undefined>) => ReadonlyArray<unknown>;
} {
  const { user, status } = useAuth();
  return useMemo(() => {
    const source = selectFantasyDataSource({
      authMode: AUTH_MODE,
      isAuthenticated: status === "authenticated" && !!user?.id,
    });
    const owner = source === "cloud" && user?.id ? user.id : LOCAL_OWNER;
    const scope: FantasyKeyScope = { source, owner };
    return {
      source,
      scope,
      key: (...rest) => scopedFantasyKey(scope, ...rest),
    };
  }, [status, user?.id]);
}
