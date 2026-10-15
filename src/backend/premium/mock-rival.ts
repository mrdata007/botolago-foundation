import { leagueStandings } from "@/mocks/fantasy-data";

/**
 * The rival's points per journée in the development duel. The base series is the example season's
 * rival (598 over 11 journées); for a rival who is in a development league's standings, the series
 * is moved so that its sum is that league mate's own total, so the duel opened always agrees with
 * the standings it was opened from (the lead is the points gap the table shows). Development data
 * only; no production code reads this.
 */
const BASE = [49, 61, 40, 50, 66, 41, 57, 59, 64, 53, 58];

const sum = (values: readonly number[]) => values.reduce((a, b) => a + b, 0);

export function rivalSeries(teamId: string | null): number[] {
  const standing = Object.values(leagueStandings)
    .flat()
    .find((row) => row.managerId === teamId);
  if (!standing) return [...BASE];
  const delta = standing.totalScore - sum(BASE);
  const each = Math.trunc(delta / BASE.length);
  let rest = delta - each * BASE.length;
  const step = Math.sign(rest);
  return BASE.map((score) => {
    const extra = rest !== 0 ? step : 0;
    rest -= extra;
    return Math.max(0, score + each + extra);
  });
}
