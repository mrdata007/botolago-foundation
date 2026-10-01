/**
 * Which gameweek the homepage band names.
 *
 * Fantasy reports the latest gameweek it has opened. Between one gameweek's
 * end and the next one's opening that is the old one (finalized, deadline
 * long past), while the fixtures below the band already belong to the next
 * round. So Fantasy's number is used only while its gameweek is still current
 * and its deadline is ahead; otherwise the band follows the next fixture.
 * With no fixture to follow it falls back to Fantasy's number.
 */
export function bandGameweek(
  fantasy: { number: number; deadline?: string; isCurrent?: boolean } | undefined,
  nextFixtureGameweek: number | undefined,
  now: number,
): number | undefined {
  if (fantasy) {
    const deadlineMs = fantasy.deadline ? Date.parse(fantasy.deadline) : Number.NaN;
    const open = fantasy.isCurrent !== false && !Number.isNaN(deadlineMs) && deadlineMs > now;
    if (open || nextFixtureGameweek === undefined) return fantasy.number;
  }
  return nextFixtureGameweek;
}
