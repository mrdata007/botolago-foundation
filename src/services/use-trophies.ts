import { useMutation, useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";

import { useOptionalAuth } from "@/auth/AuthProvider";
import {
  isTrophiesCabinet,
  type MateTrophies,
  type TrophiesCabinet,
} from "@/backend/trophies/contracts";

import { trophiesService } from "./trophies";

export const trophyKeys = {
  mine: (userId: string | null) => ["plus", "trophies", userId] as const,
  mates: (userId: string | null, leagueId: string | null) =>
    ["plus", "trophies", "mates", userId, leagueId] as const,
};

function useUserId(): string | null {
  return useOptionalAuth()?.user?.id ?? null;
}

/**
 * The reader's cabinet. `enabled` is true only while BotolaGO+ is on for the reader (member or
 * not: trophies are earned by everyone): with the feature off the query never runs, so nothing is
 * requested. An `{ available: false }` answer reads as no data (null).
 */
export function useMyTrophies(enabled: boolean): UseQueryResult<TrophiesCabinet | null> {
  const userId = useUserId();
  return useQuery({
    queryKey: trophyKeys.mine(userId),
    queryFn: async ({ signal }) => {
      const answer = await trophiesService.myTrophies(signal);
      return isTrophiesCabinet(answer) ? answer : null;
    },
    enabled: enabled && userId !== null,
    staleTime: 60_000,
    retry: false,
  });
}

/** Picks the frame drawn around the card; the cabinet is read again once it is saved. */
export function useChooseFrame() {
  const client = useQueryClient();
  const userId = useUserId();
  return useMutation({
    mutationFn: (code: string) => trophiesService.chooseFrame(code),
    onSuccess: () => client.invalidateQueries({ queryKey: trophyKeys.mine(userId) }),
  });
}

/**
 * « Montrer mes trophées »: the answer replaces the switch in the cached cabinet, so the two places
 * that show it (the trophies page and Profil) agree at once. An `{ available: false }` answer reads
 * the cabinet again.
 */
export function useSetTrophiesVisibility() {
  const client = useQueryClient();
  const userId = useUserId();
  return useMutation({
    mutationFn: (visible: boolean) => trophiesService.setVisibility(visible),
    onSuccess: (answer) => {
      if (!answer.available) {
        void client.invalidateQueries({ queryKey: trophyKeys.mine(userId) });
        return;
      }
      client.setQueryData<TrophiesCabinet | null>(trophyKeys.mine(userId), (cabinet) =>
        cabinet ? { ...cabinet, showToLeagues: answer.showToLeagues } : cabinet,
      );
    },
  });
}

/**
 * The trophies the reader's mates show in one private league, by standings row (team id). Free, and
 * behind the cabinet's own gate: `enabled` is false while BotolaGO+ is off for the reader, so
 * nothing is requested. `{ available: false }` and a league the database refuses read as no data.
 */
export function useLeagueMemberTrophies(
  leagueId: string | null,
  enabled: boolean,
): UseQueryResult<ReadonlyMap<string, MateTrophies> | null> {
  const userId = useUserId();
  return useQuery({
    queryKey: trophyKeys.mates(userId, leagueId),
    queryFn: async ({ signal }) => {
      const answer = await trophiesService.leagueMemberTrophies(leagueId!, signal);
      return answer.available ? new Map(answer.members.map((m) => [m.teamId, m])) : null;
    },
    enabled: enabled && userId !== null && leagueId !== null,
    staleTime: 60_000,
    retry: false,
  });
}
