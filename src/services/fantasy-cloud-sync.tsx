// Phase 3B2a — Fantasy cloud sync provider.
//
// For authenticated cloud-mode users this provider:
//   1. Loads the user's cloud fantasy_teams row on mount (creating one if
//      missing) and hydrates fantasyStateStore from `lifecycle_state`
//      as an internal write (no echo back to Supabase).
//   2. Listens for local mutations via the "fantasy.state.changed" event
//      and mirrors them via `save_fantasy_lifecycle`. Writes are queued
//      SERIALLY so concurrent mutations never reuse the same expected
//      version and race the DB.
//   3. Surfaces a typed status so routes can render a localized banner.
//
// Cloud errors never overwrite local working state. On conflict/error the
// local store keeps the user's latest edits; the banner offers retry /
// reload-latest so the user chooses when to reconcile.

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
import { fantasyStateStore, FANTASY_STATE_EVENT } from "@/services/fantasy-state";
import {
  clearOwnedFantasyCache,
  isOwnedFantasyKey,
  selectFantasyDataSource,
} from "@/services/fantasy-data-source";

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
  reload: () => Promise<void>;
  isCloud: boolean;
}

const Ctx = createContext<CloudSyncCtx | null>(null);

const SAVED_DISMISS_MS = 1500;
const DEBOUNCE_MS = 350;

function toPayload(): CloudLifecyclePayload {
  const s = fantasyStateStore.read();
  return {
    chips: s.chips,
    currentGameweek: s.currentGameweek,
    transferHitPoints: s.transferHitPoints,
    results: s.results,
  };
}

export function FantasyCloudSyncProvider({ children }: { children: ReactNode }) {
  const { user, status: authStatus } = useAuth();
  const qc = useQueryClient();

  const isCloud =
    selectFantasyDataSource({
      authMode: AUTH_MODE,
      isAuthenticated: authStatus === "authenticated" && !!user?.id,
    }) === "cloud";

  const [status, setStatus] = useState<CloudSyncStatus>("idle");
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [team, setTeam] = useState<CloudFantasyTeam | null>(null);

  const versionRef = useRef<number | null>(null);
  const teamIdRef = useRef<string | null>(null);
  const suppressEchoRef = useRef(false);
  const lastOwnerRef = useRef<string | null>(null);

  // Serial queue: at most ONE in-flight save. Pending re-fires collapse to
  // a single follow-up save so we always send the latest snapshot with the
  // freshest version.
  const inFlightRef = useRef(false);
  const pendingRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const invalidateOwned = useCallback(() => {
    qc.invalidateQueries({ predicate: (q) => isOwnedFantasyKey(q.queryKey) });
  }, [qc]);

  const flashSaved = useCallback(() => {
    setStatus("saved");
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    savedTimerRef.current = setTimeout(() => {
      setStatus((cur) => (cur === "saved" ? "idle" : cur));
    }, SAVED_DISMISS_MS);
  }, []);

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
      // Hydrate local store from cloud as an internal write (no echo).
      suppressEchoRef.current = true;
      fantasyStateStore.write(
        {
          chips: t.lifecycle.chips,
          currentGameweek:
            t.lifecycle.currentGameweek || fantasyStateStore.read().currentGameweek,
          transferHitPoints: t.lifecycle.transferHitPoints,
          results: t.lifecycle.results ?? {},
        },
        { internal: true },
      );
      queueMicrotask(() => {
        suppressEchoRef.current = false;
      });
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

  // Serial save runner.
  const runSave = useCallback(async () => {
    if (inFlightRef.current) {
      // Coalesce: mark that another save is needed after the current one.
      pendingRef.current = true;
      return;
    }
    const teamId = teamIdRef.current;
    const version = versionRef.current;
    if (!teamId || version == null) return;

    inFlightRef.current = true;
    setStatus("saving");
    setErrorCode(null);
    try {
      const res = await fantasyCloudRepo.saveLifecycle({
        teamId,
        expectedVersion: version,
        lifecycle: toPayload(),
      });
      versionRef.current = res.version;
      flashSaved();
      invalidateOwned();
    } catch (err) {
      if (err instanceof FantasyCloudError && err.code === "version_conflict") {
        setErrorCode("version_conflict");
        setStatus("conflict");
        // Do NOT keep firing saves with a stale version.
        pendingRef.current = false;
      } else {
        const code = err instanceof FantasyCloudError ? err.code : "unknown";
        setErrorCode(code);
        setStatus("error");
        pendingRef.current = false;
      }
    } finally {
      inFlightRef.current = false;
      if (pendingRef.current) {
        pendingRef.current = false;
        // Fire immediately with the latest snapshot + updated version.
        void runSave();
      }
    }
  }, [flashSaved, invalidateOwned]);

  // Boot / owner change.
  useEffect(() => {
    const owner = isCloud ? user?.id ?? null : null;
    if (owner === lastOwnerRef.current) return;

    clearOwnedFantasyCache(qc);
    lastOwnerRef.current = owner;

    if (!isCloud || !user?.id) {
      setStatus("idle");
      setErrorCode(null);
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
    if (typeof window === "undefined") return;

    const onChange = () => {
      if (suppressEchoRef.current) return;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        void runSave();
      }, DEBOUNCE_MS);
    };

    window.addEventListener(FANTASY_STATE_EVENT, onChange);
    return () => {
      window.removeEventListener(FANTASY_STATE_EVENT, onChange);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    };
  }, [isCloud, runSave]);

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
