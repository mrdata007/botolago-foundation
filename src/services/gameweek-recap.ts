import type { GameweekResult } from "@/types/fantasy";

/**
 * "Ma journée BotolaGO" — the private recap of one finished gameweek, as a
 * stable presentation model built only from the server's finalized result.
 *
 * Rules it keeps:
 *
 *   - Final only. A provisional gameweek stays on the points screen; the
 *     recap is `null` until the server has finalized the result.
 *   - Nothing is recalculated from today's squad. Every figure comes from the
 *     result the server stored for that gameweek (`authoritative`), so a
 *     recap does not change when the manager edits the team afterwards.
 *   - The server's `captainPoints` is the captain BONUS — the captain's points
 *     times (multiplier − 1) — not the captain's whole contribution. The
 *     counted contribution is points × multiplier, and the recap checks the
 *     two agree before it names the captain.
 *   - The parts must add up: starters + bench (Bench Boost only) + captain
 *     bonus − transfer cost = final score. When they do not, `reconciled` is
 *     false and the recap shows the total alone, never a breakdown that could
 *     count something twice.
 *   - No invented comparisons: no average, percentile, rank change or "best
 *     decision". The one explanatory line names the player who brought the
 *     most points, and only when exactly one did.
 */
export interface GameweekRecap {
  gameweek: number;
  teamName: string;
  /** The final score the server stored. */
  total: number;
  /** The result was corrected after it was first finalized. */
  corrected: boolean;
  calculationVersion: number;
  /** When the server finalized it (ISO), when it says. */
  finalizedAt: string | null;
  /** Whether the parts below add up to `total`. When false, show `total` only. */
  reconciled: boolean;
  /** The effective captain (the vice when the captain did not play). */
  captain: {
    playerId: string;
    /** The player's own points, before the multiplier. */
    points: number;
    multiplier: number;
    /** What the captain added to the total: points × multiplier. */
    counted: number;
    /** Whether the vice-captain took over the armband. */
    viceTookOver: boolean;
  } | null;
  /** Points spent on extra transfers; 0 when none. */
  transferHit: number;
  chipType: NonNullable<GameweekResult["authoritative"]>["chipType"];
  /** The player who brought the most counted points, alone at the top. */
  topContributor: { playerId: string; counted: number } | null;
}

export function buildGameweekRecap(
  result: GameweekResult | null | undefined,
  teamName: string,
): GameweekRecap | null {
  const a = result?.authoritative;
  if (!result || !a || !a.finalized || a.finalScore === null) return null;

  const total = a.finalScore;
  const bench = a.chipType === "bench_boost" ? result.benchPoints : 0;
  const reconciled = a.startingPoints + bench + a.captainPoints - a.transferHit === total;

  const pointsOf = (playerId: string) =>
    result.breakdown.find((row) => row.playerId === playerId)?.totalPoints ?? null;

  let captain: GameweekRecap["captain"] = null;
  if (reconciled && a.effectiveCaptainId) {
    const points = pointsOf(a.effectiveCaptainId);
    // The bonus the server stored must be exactly points × (multiplier − 1);
    // anything else means the figures disagree, and the line is left out.
    if (points !== null && points * (a.captainMultiplier - 1) === a.captainPoints) {
      captain = {
        playerId: a.effectiveCaptainId,
        points,
        multiplier: a.captainMultiplier,
        counted: points * a.captainMultiplier,
        // The points screen's own rule (buildServerPointsViewModel).
        viceTookOver:
          result.breakdown.find((row) => row.playerId === a.effectiveCaptainId)?.isViceCaptain ===
          true,
      };
    }
  }

  let topContributor: GameweekRecap["topContributor"] = null;
  if (reconciled) {
    const counted = result.breakdown
      // The server sets every row's multiplier: 0 for a player who did not count.
      .filter((row) => (row.multiplier ?? 0) > 0)
      .map((row) => ({ playerId: row.playerId, counted: row.totalPoints * (row.multiplier ?? 0) }))
      .sort((x, y) => y.counted - x.counted);
    const [first, second] = counted;
    if (first && first.counted > 0 && (!second || second.counted < first.counted)) {
      topContributor = first;
    }
  }

  return {
    gameweek: result.gameweek,
    teamName,
    total,
    corrected: a.gameweekStatus === "corrected",
    calculationVersion: a.calculationVersion,
    finalizedAt: a.finalizedAt,
    reconciled,
    captain,
    transferHit: reconciled ? a.transferHit : 0,
    chipType: a.chipType,
    topContributor,
  };
}
