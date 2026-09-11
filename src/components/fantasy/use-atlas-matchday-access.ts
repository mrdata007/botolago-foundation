import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/auth/AuthProvider";
import { useFantasyDataSource } from "@/services/fantasy-data-source";
import { useFantasyOwned } from "@/services/fantasy-owned-provider";
import { fantasyService } from "@/services/fantasy-runtime";
import type { FantasyRepoSource, FantasySnapshot } from "@/services/fantasy-owned-repository";
import type { AuthStatus } from "@/services/auth";

export type AtlasMatchdayAccessState = "resolving" | "landing" | "hub" | "unavailable";

export function selectAtlasMatchdayAccess(input: {
  enabled: boolean;
  authStatus: AuthStatus;
  source: FantasyRepoSource;
  snapshot: FantasySnapshot | undefined;
  ownedLoading: boolean;
  ownedError: boolean;
  localSummaryState: "pending" | "error" | "none" | "team";
}): AtlasMatchdayAccessState {
  if (!input.enabled) return "hub";
  if (input.authStatus === "loading") return "resolving";
  if (input.authStatus !== "authenticated") return "landing";
  if (input.source === "cloud") {
    if (input.ownedError) return "unavailable";
    if (input.ownedLoading || !input.snapshot) return "resolving";
    return input.snapshot.teamId && input.snapshot.team.squad.length > 0 ? "hub" : "landing";
  }
  if (input.localSummaryState === "error") return "unavailable";
  if (input.localSummaryState === "pending") return "resolving";
  return input.localSummaryState === "none" ? "landing" : "hub";
}

export function useAtlasMatchdayAccess(enabled = true) {
  const { status: authStatus } = useAuth();
  const { source, key } = useFantasyDataSource();
  const owned = useFantasyOwned();
  const summary = useQuery({
    queryKey: key("summary"),
    queryFn: () => fantasyService.getSummary(),
    enabled: enabled && source === "local",
    staleTime: 30_000,
  });
  const localSummaryState = summary.isError
    ? "error"
    : summary.isPending
      ? "pending"
      : summary.data === null
        ? "none"
        : "team";
  const state = selectAtlasMatchdayAccess({
    enabled,
    authStatus,
    source,
    snapshot: owned.snapshot,
    ownedLoading: owned.isLoading,
    ownedError: !!owned.loadError,
    localSummaryState,
  });

  return {
    isResolving: state === "resolving",
    isUnavailable: state === "unavailable",
    showAtlasMatchday: state === "landing",
    retry: () => (source === "cloud" ? owned.reload() : summary.refetch().then(() => undefined)),
  };
}
