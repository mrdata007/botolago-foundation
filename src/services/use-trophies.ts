import { useMutation, useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";

import { useAuth } from "@/auth/AuthProvider";
import { isTrophiesCabinet, type TrophiesCabinet } from "@/backend/trophies/contracts";

import { trophiesService } from "./trophies";

export const trophyKeys = {
  mine: (userId: string | null) => ["plus", "trophies", userId] as const,
};

/**
 * The reader's cabinet. `enabled` is true only while BotolaGO+ is on for the reader (member or
 * not: trophies are earned by everyone): with the feature off the query never runs, so nothing is
 * requested. An `{ available: false }` answer reads as no data (null).
 */
export function useMyTrophies(enabled: boolean): UseQueryResult<TrophiesCabinet | null> {
  const { user } = useAuth();
  const userId = user?.id ?? null;
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
  const { user } = useAuth();
  const client = useQueryClient();
  const userId = user?.id ?? null;
  return useMutation({
    mutationFn: (code: string) => trophiesService.chooseFrame(code),
    onSuccess: () => client.invalidateQueries({ queryKey: trophyKeys.mine(userId) }),
  });
}
