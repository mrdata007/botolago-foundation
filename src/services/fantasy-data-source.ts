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
// user's cached data. `clearOwnedFantasyCache` removes exactly those keys;
// `clearOwnedFantasyCacheExcept` removes all of them but the incoming
// owner's, which is what an identity change needs.

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

/**
 * Remove every owned-fantasy cache entry (all sources, all owners).
 * Used on sign-out so the next signed-in user starts clean.
 */
export function clearOwnedFantasyCache(qc: QueryClient): void {
  qc.removeQueries({ predicate: (q) => isOwnedFantasyKey(q.queryKey) });
}

/** The owner segment every owned key carries for this identity. */
export function fantasyKeyOwner(input: {
  authMode: "supabase" | "mock";
  userId: string | null;
}): string {
  const source = selectFantasyDataSource({
    authMode: input.authMode,
    isAuthenticated: !!input.userId,
  });
  return source === "cloud" && input.userId ? input.userId : LOCAL_OWNER;
}

/**
 * Remove every owned-fantasy cache entry except those of `keepOwner`, the
 * identity that is arriving (a user id, or the local pseudo-owner for a
 * guest).
 *
 * This, not `clearOwnedFantasyCache`, is the cleanup for an identity change.
 * Such a cleanup runs in an effect, after the render that has already started
 * the incoming owner's queries. Removing those too cancels their fetch and
 * strands the observer that is waiting on them, and a Fantasy screen then
 * shows "Loading…" until something else happens to re-render it — for a
 * signed-in manager on a fresh page load, often never. The outgoing owner's
 * entries are still all removed: every owned key names its owner, and the
 * incoming owner is never the outgoing one.
 */
export function clearOwnedFantasyCacheExcept(qc: QueryClient, keepOwner: string): void {
  qc.removeQueries({
    predicate: (q) => isOwnedFantasyKey(q.queryKey) && q.queryKey[2] !== keepOwner,
  });
}

/** React hook for routes: current source + a scoped-key helper. */
export function useFantasyDataSource(): {
  source: FantasyDataSource;
  scope: FantasyKeyScope;
  key: (...rest: ReadonlyArray<string | number | null | undefined>) => ReadonlyArray<unknown>;
} {
  const { user, status } = useAuth();
  return useMemo(() => {
    const userId = status === "authenticated" && user?.id ? user.id : null;
    const source = selectFantasyDataSource({ authMode: AUTH_MODE, isAuthenticated: !!userId });
    const owner = fantasyKeyOwner({ authMode: AUTH_MODE, userId });
    const scope: FantasyKeyScope = { source, owner };
    return {
      source,
      scope,
      key: (...rest) => scopedFantasyKey(scope, ...rest),
    };
  }, [status, user?.id]);
}
