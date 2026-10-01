import type { FixtureDifficulty } from "@/types/fantasy";

/**
 * Keep only fixtures that have not kicked off yet.
 *
 * The backend returns a whole gameweek, including matches already played.
 * A fixture with no kickoff time (postponed, not yet scheduled) is kept: we
 * cannot say it is in the past, and the backend decides what belongs to a
 * gameweek.
 */
export function upcomingFixtures(
  fixtures: readonly FixtureDifficulty[],
  now: Date = new Date(),
): FixtureDifficulty[] {
  return fixtures.filter((f) => {
    if (!f.kickoffAt) return true;
    const kickoff = Date.parse(f.kickoffAt);
    return Number.isNaN(kickoff) || kickoff > now.getTime();
  });
}
