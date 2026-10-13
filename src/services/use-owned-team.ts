// Pass 3.2 — Unified team/lifecycle read hook.
//
// Bridges the two authoritative sources for Team/Transfers/Points routes:
//   - source === "cloud": the FantasyOwnedProvider snapshot.
//   - source === "local": the legacy mock service + fantasyStateStore.
//
// The routes call this hook once and consume `{ team, lifecycle, teamId,
// version, purchasePrices, currentGameweekId, emptyCloudSquad, source }`
// without caring which source is authoritative. Public queries (players,
// clubs, gameweek) still come from the global mock service.

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { fantasyService as mockFantasyService } from "@/services/fantasy-mock";
import { fantasyService } from "@/services/fantasy-runtime";
import { fantasyStateStore, type FantasyPersistedState } from "@/services/fantasy-state";
import type { FantasyTeam } from "@/types/fantasy";
import type { FantasyRepoError } from "@/services/fantasy-errors";
import { useFantasyOwned } from "@/services/fantasy-owned-provider";

export interface UnifiedTeamRead {
  source: "cloud" | "guest" | "local";
  team: FantasyTeam | null;
  lifecycle: FantasyPersistedState;
  teamId: string | null;
  version: number;
  purchasePrices: Record<string, number>;
  currentGameweekId: string | null;
  /** Cloud-only: true when the cloud team exists but has no squad rows. */
  emptyCloudSquad: boolean;
  isLoading: boolean;
  error: FantasyRepoError | null;
  /** Stable user id for the owned scope (null in local mode). */
  userId: string | null;
}

export function useOwnedTeam(): UnifiedTeamRead {
  const owned = useFantasyOwned();
  const localTeamQ = useQuery({
    queryKey: ["fantasy-local-team"],
    queryFn: () => mockFantasyService.getTeam(),
    enabled: owned.source === "local",
    staleTime: 0,
  });

  // Local mode also mirrors the persisted lifecycle store so route effects
  // reading `fantasyStateStore.read()` stay in sync.
  const [localLifecycle, setLocalLifecycle] = useState<FantasyPersistedState>(() =>
    fantasyStateStore.read(),
  );
  useEffect(() => {
    if (owned.source !== "local") return;
    const onEvt = () => setLocalLifecycle(fantasyStateStore.read());
    window.addEventListener("botolago:storage", onEvt);
    window.addEventListener("storage", onEvt);
    return () => {
      window.removeEventListener("botolago:storage", onEvt);
      window.removeEventListener("storage", onEvt);
    };
  }, [owned.source]);

  return useMemo<UnifiedTeamRead>(() => {
    if (owned.source === "guest") {
      return {
        source: "guest",
        team: null,
        lifecycle: owned.snapshot?.lifecycle ?? fantasyStateStore.read(),
        teamId: null,
        version: 0,
        purchasePrices: {},
        currentGameweekId: null,
        emptyCloudSquad: true,
        isLoading: owned.isLoading,
        error: owned.loadError,
        userId: null,
      };
    }
    if (owned.source === "cloud") {
      const snap = owned.snapshot;
      return {
        source: "cloud",
        team: snap?.teamId ? snap.team : null,
        lifecycle: snap?.lifecycle ?? fantasyStateStore.read(),
        teamId: snap?.teamId ?? null,
        version: snap?.version ?? 0,
        purchasePrices: snap?.purchasePrices ?? {},
        currentGameweekId: snap?.currentGameweekId ?? null,
        emptyCloudSquad: !!snap?.emptyCloudSquad,
        isLoading: owned.isLoading,
        error: owned.loadError,
        userId: owned.userId,
      };
    }
    return {
      source: "local",
      team: localTeamQ.data ?? null,
      lifecycle: localLifecycle,
      teamId: null,
      version: 0,
      purchasePrices: {},
      currentGameweekId: null,
      emptyCloudSquad: false,
      isLoading: localTeamQ.isLoading,
      error: null,
      userId: null,
    };
  }, [
    owned.source,
    owned.snapshot,
    owned.isLoading,
    owned.loadError,
    owned.userId,
    localTeamQ.data,
    localTeamQ.isLoading,
    localLifecycle,
  ]);
}

/**
 * Reads the current live gameweek from the public mock service. Used by
 * cloud-mode saves that must resolve gameweek number → UUID via the
 * gameweek resolver in the repository layer.
 */
export function useCurrentGameweekNumber(): number | null {
  const gwQ = useQuery({
    queryKey: ["gameweek"],
    queryFn: () => fantasyService.getCurrentGameweek(),
    staleTime: 60_000,
  });
  return gwQ.data?.number ?? null;
}
