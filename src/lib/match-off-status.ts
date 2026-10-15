import type { Match, MatchOffStatus } from "@/types/domain";

/**
 * Why a match in the domain `postponed` group is not being played as
 * scheduled, or `null` for any other match.
 *
 * Postponed, suspended, cancelled and abandoned are four different facts for a
 * reader: the first two are still to come, the last two are not, and a
 * suspended or abandoned match had already kicked off. The domain status keeps
 * them in one group; the provider's word rides along in `offStatus`. Where it
 * is absent (the mocks) a called-off match is read as cancelled and any other
 * as postponed -- the narrowest claim the data supports.
 */
export function matchOffStatus(
  match: Pick<Match, "status" | "offStatus" | "calledOff">,
): MatchOffStatus | null {
  if (match.status !== "postponed") return null;
  return match.offStatus ?? (match.calledOff ? "cancelled" : "postponed");
}
