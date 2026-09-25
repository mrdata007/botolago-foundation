import type { LeaderboardScope } from "@/backend/predictions/contracts";

/**
 * Which ranking a league shows: the current journée by default, once there is
 * one, and whatever the player picks after that.
 *
 * Derived on every render rather than kept as the component's first state:
 * the journée usually arrives after the ranking has mounted (the Fantasy
 * league tab loads it only once the tab is opened), and a first state taken
 * while it was still loading stayed on the season for good.
 */
export function leagueScope(
  roundNumber: number | null,
  picked: LeaderboardScope | null,
): LeaderboardScope {
  return roundNumber === null ? "season" : (picked ?? "round");
}
