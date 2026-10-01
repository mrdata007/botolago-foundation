import type { FixtureDifficulty } from "@/types/fantasy";

/**
 * Only the fixtures that have not kicked off yet.
 *
 * The fixture-difficulty feed starts at Fantasy's current gameweek, and that
 * stays on the previous round until it is finalized. So for days after a
 * round has been played, the feed still lists its matches, and a player's
 * "Prochains matchs" showed J.1 after J.1 had been played.
 *
 * This only ever removes rows; it never adds one. A row with no kickoff, or
 * one that cannot be read as a date, is kept, because "unknown" is not
 * "played" and the backend's answer is not second-guessed without evidence.
 */
export function upcomingFixtures<T extends Pick<FixtureDifficulty, "kickoffAt">>(
  fixtures: readonly T[],
  now: number = Date.now(),
): T[] {
  return fixtures.filter((fixture) => {
    if (!fixture.kickoffAt) return true;
    const kickoff = Date.parse(fixture.kickoffAt);
    return Number.isNaN(kickoff) || kickoff > now;
  });
}
