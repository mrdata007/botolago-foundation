import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { useAuth } from "@/auth/AuthProvider";
import {
  isCareerMember,
  isDuelMember,
  type CareerMember,
  type DuelMember,
} from "@/backend/premium/card-reads";

import { premiumCardReadsService } from "./premium-card-reads";

export const premiumCardKeys = {
  career: (userId: string | null) => ["premium", "career", userId] as const,
  duel: (userId: string | null, otherTeamId: string | null) =>
    ["premium", "duel", userId, otherTeamId] as const,
};

/**
 * The member's career (« Votre saison »). `enabled` is true only for a member: for anyone else the
 * query never runs, so the paid read is never called. A `{ locked: true }` or `{ available: false }`
 * answer reads as no data (null).
 */
export function useMyCareer(enabled: boolean): UseQueryResult<CareerMember | null> {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  return useQuery({
    queryKey: premiumCardKeys.career(userId),
    queryFn: async ({ signal }) => {
      const answer = await premiumCardReadsService.career(null, signal);
      return isCareerMember(answer) ? answer : null;
    },
    enabled: enabled && userId !== null,
    staleTime: 60_000,
    retry: false,
  });
}

/** The duel with one league mate (« Détail du duel »), for a member only. */
export function useCardDuel(
  otherTeamId: string | null,
  enabled: boolean,
): UseQueryResult<DuelMember | null> {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  return useQuery({
    queryKey: premiumCardKeys.duel(userId, otherTeamId),
    queryFn: async ({ signal }) => {
      const answer = await premiumCardReadsService.duel(otherTeamId!, null, signal);
      return isDuelMember(answer) ? answer : null;
    },
    enabled: enabled && userId !== null && otherTeamId !== null,
    staleTime: 60_000,
    retry: false,
  });
}
