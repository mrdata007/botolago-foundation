import type { Match } from "@/types/domain";

export const MATCH_TIME_ZONE = "Africa/Casablanca";

/**
 * The current provider calendar uses UTC midnight for dates without a verified
 * kickoff hour. Until the public DTO carries confirmation metadata, show these
 * scheduled dates without presenting the placeholder hour as confirmed.
 * This is presentation only; fixture timestamps and Fantasy deadlines stay intact.
 */
export function isKickoffTimeUnconfirmed(match: Pick<Match, "kickoff" | "status">): boolean {
  if (match.status !== "scheduled") return false;
  const kickoff = new Date(match.kickoff);
  return (
    Number.isFinite(kickoff.getTime()) &&
    kickoff.getUTCHours() === 0 &&
    kickoff.getUTCMinutes() === 0 &&
    kickoff.getUTCSeconds() === 0 &&
    kickoff.getUTCMilliseconds() === 0
  );
}
