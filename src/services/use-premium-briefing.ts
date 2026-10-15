import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { useAuth } from "@/auth/AuthProvider";
import {
  isAlternativesMember,
  isBriefingMember,
  type AlternativesMember,
  type BriefingMember,
} from "@/backend/premium/briefing";

import { premiumBriefingService } from "./premium-briefing";

export const premiumBriefingKeys = {
  briefing: (userId: string | null) => ["premium", "briefing", userId] as const,
  alternatives: (userId: string | null, playerOut: string | null) =>
    ["premium", "briefing-alternatives", userId, playerOut] as const,
};

/** What a member's briefing read came to. `empty`: no team or no gameweek open for changes. */
export type BriefingState =
  | { kind: "member"; view: BriefingMember }
  | { kind: "empty" }
  | { kind: "unavailable" };

/**
 * The member's briefing. `enabled` is true only for a member: for anyone else the query never runs,
 * so the paid read is never called. A switched-off or locked answer reads as `unavailable`.
 */
export function useBriefing(enabled: boolean): UseQueryResult<BriefingState> {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  return useQuery({
    queryKey: premiumBriefingKeys.briefing(userId),
    queryFn: async ({ signal }): Promise<BriefingState> => {
      const answer = await premiumBriefingService.briefing(signal);
      if (isBriefingMember(answer)) return { kind: "member", view: answer };
      if (answer.available && !answer.locked) return { kind: "empty" };
      return { kind: "unavailable" };
    },
    enabled: enabled && userId !== null,
    staleTime: 60_000,
    retry: false,
  });
}

/** Alternatives for one of the member's own players; null while off, locked or not asked for. */
export function useBriefingAlternatives(
  enabled: boolean,
  playerOut: string | null,
): UseQueryResult<AlternativesMember | null> {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  return useQuery({
    queryKey: premiumBriefingKeys.alternatives(userId, playerOut),
    queryFn: async ({ signal }) => {
      const answer = await premiumBriefingService.alternatives(playerOut ?? "", signal);
      return isAlternativesMember(answer) ? answer : null;
    },
    enabled: enabled && userId !== null && playerOut !== null,
    staleTime: 60_000,
    retry: false,
  });
}
