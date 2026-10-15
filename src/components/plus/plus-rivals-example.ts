import { rivalSchema, type Rival } from "@/backend/premium/rivals";

/**
 * The example board under the locked blur (never the reader's own data): Karim B. in journée 11,
 * 612 points, against two friends. The scores are the example season's (`plus-season-data.ts`);
 * the friends' are example values, like their names (given in the reader's language).
 */
const SEASON_ID = "00000000-0000-4000-8000-000000000001";
const LEAGUE = { id: "00000000-0000-4000-8000-000000000701", name: "Les Lions du Derb" };
const PUBLISHED_AT = "2026-10-12T18:00:00+00:00";
const YOU = [52, 58, 44, 56, 63, 44, 60, 55, 71, 47, 62];
const FIRST = [49, 61, 40, 50, 66, 41, 57, 59, 64, 53, 58];
const SECOND = [50, 60, 48, 52, 64, 43, 59, 56, 66, 50, 79];

const sum = (values: readonly number[]) => values.reduce((a, b) => a + b, 0);
const leaderOf = (me: number, rival: number) => (me > rival ? "me" : me < rival ? "rival" : "tie");

function example(name: string, scores: number[], teamId: string, position: number): Rival {
  const weeks = YOU.map((me, i) => ({ seq: i + 1, me, rival: scores[i]! }));
  const wins = weeks.filter((w) => w.me > w.rival);
  const best = wins.reduce<(typeof weeks)[number] | null>(
    (top, w) => (top === null || w.me - w.rival > top.me - top.rival ? w : top),
    null,
  );
  return rivalSchema.parse({
    teamId,
    name,
    position,
    league: LEAGUE,
    historyVisible: false,
    last: {
      seq: 11,
      name: "Journée 11",
      publishedAt: PUBLISHED_AT,
      correctedAt: null,
      me: YOU[10],
      rival: scores[10],
      meTotal: sum(YOU),
      rivalTotal: sum(scores),
      leader: leaderOf(sum(YOU), sum(scores)),
      leaderBefore: leaderOf(sum(YOU.slice(0, -1)), sum(scores.slice(0, -1))),
    },
    tally: {
      played: weeks.length,
      won: wins.length,
      lost: weeks.filter((w) => w.me < w.rival).length,
      tied: weeks.filter((w) => w.me === w.rival).length,
    },
    biggestWin: best
      ? { seq: best.seq, me: best.me, rival: best.rival, margin: best.me - best.rival }
      : null,
    weeks,
    captain: null,
    transfer: null,
  });
}

export const EXAMPLE_SEASON = { id: SEASON_ID, label: "2026/27" };

/** The example's two rivals, named by the caller (the names are dictionary entries). */
export function exampleRivals(first: string, second: string): Rival[] {
  return [
    example(first, FIRST, "00000000-0000-4000-8000-000000000801", 1),
    example(second, SECOND, "00000000-0000-4000-8000-000000000802", 2),
  ];
}

export const EXAMPLE_ME = { name: "Karim B.", total: sum(YOU) };
