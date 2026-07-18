// Phase 3B2a — Fantasy cloud sync provider.
//
// For authenticated cloud-mode users this provider:
//   1. Loads the user's cloud fantasy_teams row on mount (creating one if
//      missing) and hydrates fantasyStateStore from `lifecycle_state`.
//   2. Subscribes to local state changes (fantasyStateStore.write emits a
//      "fantasy.state.changed" event) and pushes each change to the cloud
//      via `save_fantasy_lifecycle`, using the last-known version for
//      optimistic concurrency.
//   3. Surfaces a typed status ("idle" | "loading" | "saving" | "saved" |
//      "error" | "conflict") so routes can render a localized banner.
//
// The pure engine remains authoritative for validation/scoring. This
// provider only mirrors the persisted lifecycle bag; it never re-computes
// results.

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
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/auth/AuthProvider";
import { AUTH_MODE } from "@/services/auth";
import {
  fantasyCloudRepo,
  FantasyCloudError,
  type CloudFantasyTeam,
  type CloudLifecyclePayload,
} from "@/services/fantasy-cloud-repo";
import { fantasyStateStore } from "@/services/fantasy-state";
import { clearOwnedFantasyCache, selectFantasyDataSource } from "@/services/fantasy-data-source";

export type CloudSyncStatus =
  | "idle"
  | "loading"
  | "saving"
  | "saved"
  | "error"
  | "conflict";

interface CloudSyncCtx {
  status: CloudSyncStatus;
  errorCode: string | null;
  teamId: string | null;
  version: number | null;
  /** Trigger a fresh cloud reload; used by the retry / "reload latest" button. */
  reload: () => Promise<void>;
  /** True when this session runs against cloud (authenticated + supabase). */
  isCloud: boolean;
}

const Ctx = createContext<CloudSyncCtx | null>(null);

const STATE_EVENT = "fantasy.state.changed";

function toPayload(): CloudLifecyclePayload {
  const s = fantasyStateStore.read();
  return {
    chips: s.chips,
    currentGameweek: s.currentGameweek,
    transferHitPoints: s.transferHitPoints,
    results: s.results,
  };
}

function applyPayload(p: CloudLifecyclePayload) {
  fantasyStateStore.write({
    chips: p.chips,
    currentGameweek: p.currentGameweek || fantasyStateStore.read().currentGameweek,
    transferHitPoints: p.transferHitPoints,
    results: p.results ?? {},
  });
}

export function FantasyCloudSyncProvider({ children }: { children: ReactNode }) {
  const { user, status: authStatus } = useAuth();
  const qc = useQueryClient();

  const isCloud = selectFantasyDataSource({
    authMode: AUTH_MODE,
    isAuthenticated: authStatus === "authenticated" && !!user?.id,
  }) === "cloud";

  const [status, setStatus] = useState<CloudSyncStatus>("idle");
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [team, setTeam] = useState<CloudFantasyTeam | null>(null);

  const versionRef = useRef<number | null>(null);
  const teamIdRef = useRef<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressEcho = useRef(false);
  const lastOwnerRef = useRef<string | null>(null);

  const load = useCallback(async (uid: string) => {
    setStatus("loading");
    setErrorCode(null);
    try {
      const t = await fantasyCloudRepo.loadOrCreateTeam({
        userId: uid,
        teamName: "Atlas XI",
      });
      teamIdRef.current = t.id;
      versionRef.current = t.version;
      setTeam(t);
      // Hydrate local store from cloud, suppressing the echo that would
      // otherwise re-push the same payload back up.
      suppressEcho.current = true;
      applyPayload(t.lifecycle);
      // Microtask boundary: let the change event flush before re-enabling.
      queueMicrotask(() => { suppressEcho.current = false; });
      setStatus("idle");
    } catch (err) {
      const code = err instanceof FantasyCloudError ? err.code : "unknown";
      setErrorCode(code);
      setStatus("error");
    }
  }, []);

  const reload = useCallback(async () => {
    if (!user?.id) return;
    await load(user.id);
  }, [load, user?.id]);

  // Boot / owner change.
  useEffect(() => {
    const owner = isCloud ? user?.id ?? null : null;
    if (owner === lastOwnerRef.current) return;

    // Owner changed — always drop scoped cache from previous owner.
    clearOwnedFantasyCache(qc);
    lastOwnerRef.current = owner;

    if (!isCloud || !user?.id) {
      setStatus("idle");
      setTeam(null);
      teamIdRef.current = null;
      versionRef.current = null;
      return;
    }
    void load(user.id);
  }, [isCloud, user?.id, load, qc]);

  // Local → cloud mirror.
  useEffect(() => {
    if (!isCloud) return;

    const push = async () => {
      if (suppressEcho.current) return;
      const teamId = teamIdRef.current;
      const version = versionRef.current;
      if (!teamId || version == null) return;
      setStatus("saving");
      setErrorCode(null);
      try {
        const res = await fantasyCloudRepo.saveLifecycle({
          teamId,
          expectedVersion: version,
          lifecycle: toPayload(),
        });
        versionRef.current = res.version;
        setStatus("saved");
        // Invalidate every owned key so Team/Transfers/Points/summary refetch.
        qc.invalidateQueries({ predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === "owned-fantasy" });
      } catch (err) {
        if (err instanceof FantasyCloudError && err.code === "version_conflict") {
          setErrorCode("version_conflict");
          setStatus("conflict");
        } else {
          const code = err instanceof FantasyCloudError ? err.code : "unknown";
          setErrorCode(code);
          setStatus("error");
        }
      }
    };

    const onChange = () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => { void push(); }, 350);
    };

    window.addEventListener(STATE_EVENT, onChange);
    return () => {
      window.removeEventListener(STATE_EVENT, onChange);
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [isCloud, qc]);

  const value = useMemo<CloudSyncCtx>(
    () => ({
      status,
      errorCode,
      teamId: team?.id ?? null,
      version: versionRef.current,
      reload,
      isCloud,
    }),
    [status, errorCode, team?.id, reload, isCloud],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useFantasyCloudSync(): CloudSyncCtx {
  const v = useContext(Ctx);
  if (!v) {
    // Provider not mounted (e.g. non-fantasy routes) — return a neutral shape.
    return {
      status: "idle",
      errorCode: null,
      teamId: null,
      version: null,
      reload: async () => {},
      isCloud: false,
    };
  }
  return v;
}
