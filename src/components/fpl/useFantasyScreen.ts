import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { useAuth } from "@/auth/AuthProvider";
import { useI18n } from "@/i18n/provider";
import { footballService } from "@/services/football";
import { fantasyService } from "@/services/fantasy-runtime";
import { useFantasyOwned } from "@/services/fantasy-owned-provider";
import { fantasyPlayersQuery } from "@/services/fantasy-queries";
import { useFantasyAvailability } from "@/services/use-fantasy-availability";
import type { Club, Gameweek } from "@/types/domain";
import type { FantasyPlayer, FantasyTeam } from "@/types/fantasy";

export type FantasyScreenPhase =
  /** Availability, authentication or the owned snapshot is still resolving (finite: bounded by query timeouts). */
  | "loading"
  /** The backend has no open Fantasy season. */
  | "season_closed"
  /** A season exists but no playable gameweek yet. */
  | "awaiting_gameweek"
  /** A request failed; `retry` asks again for what failed. */
  | "error"
  /** Anonymous visitor on a screen that needs a signed-in manager. */
  | "guest"
  /** Signed in, season open, but this manager has no team yet. */
  | "no_team"
  /** Everything needed by the screen is available. */
  | "ready";

export interface FantasyScreenState {
  phase: FantasyScreenPhase;
  canCreate: boolean;
  players: FantasyPlayer[];
  clubs: Club[];
  gameweek: Gameweek | null;
  team: FantasyTeam | null;
  isGuest: boolean;
  isCloud: boolean;
  retry: () => void;
  error: unknown;
}

/**
 * Single source of truth for every Fantasy screen's entry state.
 *
 * Each dependency is an independent React Query; none of them can block the
 * others indefinitely (availability is timeout-bounded, the rest follow the
 * app's retry policy -- once, jittered, never for a refusal a retry cannot
 * change such as a code owed -- and then surface an error with a retry
 * action). Screens that do not need a team (`needsTeam: false`) still receive
 * it when present.
 */
export function useFantasyScreen(options: { needsTeam?: boolean; needsAuth?: boolean } = {}) {
  const { needsTeam = true, needsAuth = true } = options;
  const { lang } = useI18n();
  const { status: authStatus } = useAuth();
  const availability = useFantasyAvailability();
  const owned = useFantasyOwned();
  const ready = availability.view.kind === "ready";
  const isGuest = owned.source === "guest";
  const isCloud = owned.source === "cloud";

  const playersQ = useQuery({ ...fantasyPlayersQuery(), enabled: ready });
  const clubsQ = useQuery({
    queryKey: ["football", "clubs", lang],
    queryFn: () => footballService.getClubs(lang),
    staleTime: 5 * 60_000,
  });
  const gwQ = useQuery({
    queryKey: ["gameweek"],
    queryFn: () => fantasyService.getCurrentGameweek(),
    enabled: ready,
    staleTime: 60_000,
  });

  // Only what failed: asking again for all five read the hub and the whole
  // player pool again for a screen that was missing one of them.
  const retry = () => {
    if (availability.isError || availability.view.kind === "error") void availability.refetch();
    if (playersQ.isError) void playersQ.refetch();
    if (clubsQ.isError) void clubsQ.refetch();
    if (gwQ.isError) void gwQ.refetch();
    if (owned.loadError) void owned.reload();
  };

  return useMemo<FantasyScreenState>(() => {
    const base = {
      canCreate: availability.view.kind === "ready" && availability.view.canCreate,
      players: playersQ.data ?? [],
      clubs: clubsQ.data ?? [],
      gameweek: gwQ.data ?? null,
      team:
        owned.snapshot?.team && owned.snapshot.team.squad.length > 0 ? owned.snapshot.team : null,
      isGuest,
      isCloud,
      retry,
      error: availability.error ?? playersQ.error ?? clubsQ.error ?? gwQ.error ?? owned.loadError,
    };
    const view = availability.view;
    if (view.kind === "loading") return { ...base, phase: "loading" };
    if (view.kind === "error") return { ...base, phase: "error" };
    if (view.kind === "season_closed" || view.kind === "awaiting_gameweek") {
      return { ...base, phase: view.kind };
    }
    if (needsAuth && authStatus === "loading") return { ...base, phase: "loading" };
    if (needsAuth && isGuest) return { ...base, phase: "guest" };
    if (playersQ.isError || clubsQ.isError || gwQ.isError || owned.loadError) {
      return { ...base, phase: "error" };
    }
    if (!playersQ.data || !clubsQ.data || !gwQ.data) return { ...base, phase: "loading" };
    if (isCloud && owned.isLoading && !owned.snapshot) return { ...base, phase: "loading" };
    if (needsTeam && !base.team) return { ...base, phase: "no_team" };
    return { ...base, phase: "ready" };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    availability.view,
    availability.error,
    authStatus,
    isGuest,
    isCloud,
    needsAuth,
    needsTeam,
    playersQ.data,
    playersQ.isError,
    playersQ.error,
    clubsQ.data,
    clubsQ.isError,
    clubsQ.error,
    gwQ.data,
    gwQ.isError,
    gwQ.error,
    owned.snapshot,
    owned.isLoading,
    owned.loadError,
  ]);
}
