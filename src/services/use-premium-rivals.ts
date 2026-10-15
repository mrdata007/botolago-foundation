import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";

import { useAuth } from "@/auth/AuthProvider";
import {
  isRivalsMember,
  type PinOutcome,
  type RivalCandidate,
  type RivalsMember,
} from "@/backend/premium/rivals";

import { premiumRivalsService } from "./premium-rivals";

export const premiumRivalsKeys = {
  all: (userId: string | null) => ["premium", "rivals", userId] as const,
  board: (userId: string | null) => ["premium", "rivals", userId, "board"] as const,
  candidates: (userId: string | null) => ["premium", "rivals", userId, "candidates"] as const,
};

/**
 * The member's pinned rivals, each with a head-to-head. `enabled` is true only for a member: for
 * anyone else the query never runs, so the paid read is never called. A `{ locked: true }` or
 * `{ available: false }` answer reads as no data (null).
 */
export function useMyRivals(enabled: boolean): UseQueryResult<RivalsMember | null> {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  return useQuery({
    queryKey: premiumRivalsKeys.board(userId),
    queryFn: async ({ signal }) => {
      const answer = await premiumRivalsService.myRivals(signal);
      return isRivalsMember(answer) ? answer : null;
    },
    enabled: enabled && userId !== null,
    staleTime: 60_000,
    retry: false,
  });
}

/** The league mates a member could pin, read only while the add list is open. */
export function useRivalCandidates(enabled: boolean): UseQueryResult<RivalCandidate[]> {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  return useQuery({
    queryKey: premiumRivalsKeys.candidates(userId),
    queryFn: async ({ signal }) => {
      const answer = await premiumRivalsService.candidates(signal);
      return answer.available && !answer.locked ? answer.candidates : [];
    },
    enabled: enabled && userId !== null,
    staleTime: 30_000,
    retry: false,
  });
}

/** Pin, unpin and the notification switch: each refreshes the board (and the add list). */
export function useRivalActions(): {
  pin: UseMutationResult<PinOutcome, Error, string>;
  unpin: UseMutationResult<void, Error, string>;
  notify: UseMutationResult<boolean | null, Error, boolean>;
} {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id ?? null;
  const refresh = () => queryClient.invalidateQueries({ queryKey: premiumRivalsKeys.all(userId) });
  const pin = useMutation({
    mutationFn: (teamId: string) => premiumRivalsService.pin(teamId),
    onSuccess: refresh,
  });
  const unpin = useMutation({
    mutationFn: (teamId: string) => premiumRivalsService.unpin(teamId),
    onSuccess: refresh,
  });
  const notify = useMutation({
    mutationFn: (enabled: boolean) => premiumRivalsService.setNotify(enabled),
    onSuccess: refresh,
  });
  return { pin, unpin, notify };
}
