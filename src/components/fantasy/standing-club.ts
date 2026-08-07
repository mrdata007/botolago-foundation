import type { Club } from "@/types/domain";
import type { LeagueStanding } from "@/types/fantasy";

export function findStandingClub(
  standing: Pick<LeagueStanding, "clubId">,
  clubs?: readonly Club[],
): Club | undefined {
  if (!standing.clubId) return undefined;
  return clubs?.find((club) => club.id === standing.clubId);
}
