// Pass 3.1 — Shared owned-Fantasy provider.
//
// Replaces the earlier FantasyCloudSyncProvider. Key differences:
//   - NO automatic mirroring of `fantasyStateStore` mutations to Supabase.
//     Authoritative cloud writes happen only through the route mutations
//     (FantasyOwnedRepository.saveTeam / .confirmTransfers / .finalizeGameweek).
//   - Exposes ONE authoritative snapshot query (React Query) keyed by
//     source + uid so switching users can never leak cached data.
//   - Exposes source, repo, reload/invalidate helpers, and last mutation
//     status so Home and Fantasy routes derive summary + banner state from
//     a single truth.
//   - Cloud errors surface as-is; there is no silent fallback to local.
//
// SSR/hydration-safe: repo instantiation is memoized and cloud fetches only
// fire in the browser query environment.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { AUTH_MODE } from "@/services/auth";
import { useAuth } from "@/auth/AuthProvider";
import {
  createFantasyOwnedRepository,
  selectFantasyRepoSource,
  type FantasyOwnedRepository,
  type FantasyRepoSource,
  type FantasySnapshot,
} from "@/services/fantasy-owned-repository";
import { FantasyRepoError } from "@/services/fantasy-errors";
import { forgetSharedFantasyHub } from "@/services/fantasy-hub-share";
import {
  scopedFantasyKey,
  clearOtherOwnersFantasyCache,
  isOwnedFantasyKey,
  type FantasyKeyScope,
} from "@/services/fantasy-data-source";

export type OwnedMutationStatus = "idle" | "saving" | "saved" | "error" | "conflict";

export interface FantasyOwnedContextValue {
  source: FantasyRepoSource;
  userId: string | null;
  repo: FantasyOwnedRepository;
  scope: FantasyKeyScope;
  snapshot: FantasySnapshot | undefined;
  isLoading: boolean;
  isFetching: boolean;
  loadError: FantasyRepoError | null;
  mutationStatus: OwnedMutationStatus;
  mutationError: FantasyRepoError | null;
  setMutationStatus: (s: OwnedMutationStatus, err?: FantasyRepoError | null) => void;
  /**
   * H1: reserve a monotonic sequence number for a mutation. Later calls to
   * `setMutationStatusIfCurrent(seq, ...)` are ignored if a newer sequence
   * has already been reserved — preventing a stale `saved→idle` timer from
   * overwriting a newer `saving` status.
   */
  nextMutationSeq: () => number;
  setMutationStatusIfCurrent: (
    seq: number,
    s: OwnedMutationStatus,
    err?: FantasyRepoError | null,
  ) => void;
  /**
   * H1: replace the authoritative cached snapshot with a returned value
   * without a network round-trip. Callers still use `invalidateOwned()` for
   * dependent surfaces.
   */
  replaceSnapshot: (next: FantasySnapshot) => void;
  reload: () => Promise<void>;
  invalidateOwned: () => void;
}

const Ctx = createContext<FantasyOwnedContextValue | null>(null);

const SNAPSHOT_KIND = "snapshot";
const LOCAL_OWNER = "__local__";

export function FantasyOwnedProvider({ children }: { children: ReactNode }) {
  const { user, status: authStatus } = useAuth();
  const qc = useQueryClient();

  const isAuthenticated = authStatus === "authenticated" && !!user?.id;
  const source = selectFantasyRepoSource({
    authMode: AUTH_MODE,
    isAuthenticated,
  });
  const userId = source === "cloud" ? (user?.id ?? null) : null;
  const owner = userId ?? LOCAL_OWNER;

  const repo = useMemo<FantasyOwnedRepository>(() => {
    return createFantasyOwnedRepository({
      authMode: AUTH_MODE,
      isAuthenticated,
      userId,
    });
    // Deps must trigger a fresh instance when the identity changes.
  }, [isAuthenticated, userId]);

  const scope = useMemo<FantasyKeyScope>(() => ({ source, owner }), [source, owner]);
  const queryKey = useMemo(() => scopedFantasyKey(scope, SNAPSHOT_KIND), [scope]);

  const query = useQuery<FantasySnapshot, FantasyRepoError>({
    queryKey,
    queryFn: async () => {
      try {
        return await repo.loadSnapshot();
      } catch (err) {
        // Never silently fall back to local. Rethrow the typed error.
        if (err instanceof FantasyRepoError) throw err;
        throw new FantasyRepoError("unknown", err instanceof Error ? err.message : String(err));
      }
    },
    // Cloud snapshot invalidations are triggered explicitly by mutations
    // or by the auth-change hook below.
    staleTime: 30_000,
    retry: (count, err) => {
      // Version conflicts / permission errors are terminal — never retry. So
      // is a read refused until the one-time code is in: the auth layer takes
      // the manager to the code, and the snapshot is read again after it.
      if (
        err.code === "version_conflict" ||
        err.code === "permission_denied" ||
        err.code === "unauthenticated" ||
        err.code === "mapping_incomplete" ||
        err.code === "mfa_required"
      ) {
        return false;
      }
      return count < 1;
    },
  });

  const [mutationStatus, setMutationStatusState] = useState<OwnedMutationStatus>("idle");
  const [mutationError, setMutationError] = useState<FantasyRepoError | null>(null);
  const mutationSeqRef = useRef(0);
  const activeSeqRef = useRef(0);

  const setMutationStatus = useCallback((s: OwnedMutationStatus, err?: FantasyRepoError | null) => {
    setMutationStatusState(s);
    setMutationError(err ?? null);
  }, []);

  const nextMutationSeq = useCallback(() => {
    mutationSeqRef.current += 1;
    activeSeqRef.current = mutationSeqRef.current;
    return mutationSeqRef.current;
  }, []);

  const setMutationStatusIfCurrent = useCallback(
    (seq: number, s: OwnedMutationStatus, err?: FantasyRepoError | null) => {
      // Ignore updates from a superseded mutation.
      if (seq !== activeSeqRef.current) return;
      setMutationStatusState(s);
      setMutationError(err ?? null);
    },
    [],
  );

  const invalidateOwned = useCallback(() => {
    forgetSharedFantasyHub();
    qc.invalidateQueries({ predicate: (q) => isOwnedFantasyKey(q.queryKey) });
  }, [qc]);

  const replaceSnapshot = useCallback(
    (next: FantasySnapshot) => {
      qc.setQueryData(queryKey, next);
    },
    [qc, queryKey],
  );

  const reload = useCallback(async () => {
    forgetSharedFantasyHub();
    await qc.invalidateQueries({ queryKey });
    await query.refetch();
  }, [qc, queryKey, query]);

  // On owner-identity change (sign-in/out, account switch): drop every other
  // owner's cache entries so the next authenticated user cannot see stale
  // data. The new owner's own queries stay: this render created them, and
  // removing one cancels its first fetch and leaves the screen loading. This
  // does NOT touch drafts (see fantasy-signout-cleanup for that path) or
  // guest local prototype data.
  useEffect(() => {
    forgetSharedFantasyHub();
    clearOtherOwnersFantasyCache(qc, scope);
    setMutationStatusState("idle");
    setMutationError(null);
    mutationSeqRef.current = 0;
    activeSeqRef.current = 0;
    // We intentionally depend on the owner's scope so identity swaps trigger cleanup.
  }, [scope, qc]);

  const value = useMemo<FantasyOwnedContextValue>(
    () => ({
      source,
      userId,
      repo,
      scope,
      snapshot: query.data,
      isLoading: query.isLoading,
      isFetching: query.isFetching,
      loadError: (query.error as FantasyRepoError | null) ?? null,
      mutationStatus,
      mutationError,
      setMutationStatus,
      nextMutationSeq,
      setMutationStatusIfCurrent,
      replaceSnapshot,
      reload,
      invalidateOwned,
    }),
    [
      source,
      userId,
      repo,
      scope,
      query.data,
      query.isLoading,
      query.isFetching,
      query.error,
      mutationStatus,
      mutationError,
      setMutationStatus,
      nextMutationSeq,
      setMutationStatusIfCurrent,
      replaceSnapshot,
      reload,
      invalidateOwned,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useFantasyOwned(): FantasyOwnedContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useFantasyOwned must be used inside FantasyOwnedProvider");
  return v;
}

/**
 * Back-compat shim for the existing `<CloudSyncBanner />` API. Derives
 * banner status from the owned-provider snapshot + last mutation. Renders
 * nothing in local/guest mode.
 */
export function useFantasyCloudSyncStatus(): {
  isCloud: boolean;
  status: "idle" | "loading" | "saving" | "saved" | "error" | "conflict";
  errorCode: string | null;
  reload: () => Promise<void>;
} {
  const { source, isLoading, loadError, mutationStatus, mutationError, reload } = useFantasyOwned();
  const isCloud = source === "cloud";
  if (!isCloud) {
    return { isCloud, status: "idle", errorCode: null, reload };
  }
  if (isLoading) return { isCloud, status: "loading", errorCode: null, reload };
  if (mutationStatus !== "idle") {
    return {
      isCloud,
      status: mutationStatus,
      errorCode: mutationError?.code ?? null,
      reload,
    };
  }
  if (loadError) {
    return {
      isCloud,
      status: loadError.code === "version_conflict" ? "conflict" : "error",
      errorCode: loadError.code,
      reload,
    };
  }
  return { isCloud, status: "idle", errorCode: null, reload };
}
