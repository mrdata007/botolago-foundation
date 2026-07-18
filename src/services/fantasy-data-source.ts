// Phase 3B2a — Fantasy owned-data source selector + query key helpers.
//
// Contract:
//   - Auth mode = supabase AND user is authenticated  → "cloud"
//   - Otherwise (guest, mock auth mode, unauthenticated) → "local"
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

export type FantasyDataSource = "cloud" | "local";

export function selectFantasyDataSource(input: {
  authMode: "supabase" | "mock";
  isAuthenticated: boolean;
}): FantasyDataSource {
  if (input.authMode === "supabase" && input.isAuthenticated) return "cloud";
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
