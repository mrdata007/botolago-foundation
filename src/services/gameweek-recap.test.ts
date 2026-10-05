import { describe, expect, test } from "bun:test";

import type { GameweekResult } from "@/types/fantasy";
import { buildGameweekRecap } from "./gameweek-recap";
import { buildServerPointsViewModel } from "./points-service";

type Row = { id: string; points: number; multiplier: number; bench?: boolean };

/**
 * A finalized result shaped like the server's: starters' points, the captain
 * BONUS (points × (multiplier − 1)), bench points and the transfer cost.
 */
function result(
  rows: Row[],
  overrides: Partial<NonNullable<GameweekResult["authoritative"]>> = {},
  captainId = "c",
): GameweekResult {
  const starters = rows.filter((row) => !row.bench);
  const captainRow = rows.find((row) => row.multiplier > 1);
  const startingPoints = starters
    .filter((row) => row.multiplier > 0)
    .reduce((sum, row) => sum + row.points, 0);
  const captainPoints = captainRow ? captainRow.points * (captainRow.multiplier - 1) : 0;
  const benchPoints = rows.filter((row) => row.bench).reduce((sum, row) => sum + row.points, 0);
  const transferHit = overrides.transferHit ?? 0;
  const chip = overrides.chipType ?? null;
  const finalScore =
    startingPoints + (chip === "bench_boost" ? benchPoints : 0) + captainPoints - transferHit;
  return {
    gameweek: 9,
    totalPoints: finalScore,
    benchPoints,
    captainId,
    autoSubs: [],
    breakdown: rows.map((row) => ({
      playerId: row.id,
      multiplier: row.multiplier,
      totalPoints: row.points,
      minutesPlayed: 90,
      isBench: row.bench || undefined,
      isViceCaptain: (row.multiplier > 1 && row.id !== captainId) || undefined,
      status: "final",
      events: [],
    })),
    authoritative: {
      startingIds: starters.map((row) => row.id),
      benchIds: rows.filter((row) => row.bench).map((row) => row.id),
      effectiveCaptainId: captainRow?.id ?? null,
      captainMultiplier: captainRow?.multiplier ?? 1,
      captainPoints,
      transferHit,
      chipType: chip,
      incremental: false,
      finalized: true,
      startingPoints,
      finalScore,
      gameweekStatus: "finalized",
      calculationVersion: 3,
      finalizedAt: "2026-10-03T22:00:00Z",
      ...overrides,
    },
  } as GameweekResult;
}

const SQUAD: Row[] = [
  { id: "c", points: 8, multiplier: 2 },
  { id: "a", points: 11, multiplier: 1 },
  { id: "b", points: 2, multiplier: 1 },
  { id: "x", points: 5, multiplier: 1, bench: true },
];

describe("buildGameweekRecap", () => {
  test("a final result: total, captain counted once as points × multiplier", () => {
    const recap = buildGameweekRecap(result(SQUAD), "Atlas XI");
    expect(recap).toMatchObject({
      gameweek: 9,
      teamName: "Atlas XI",
      total: 8 + 11 + 2 + 8, // starters + captain bonus
      reconciled: true,
      corrected: false,
      calculationVersion: 3,
      finalizedAt: "2026-10-03T22:00:00Z",
      captain: { playerId: "c", points: 8, multiplier: 2, counted: 16, viceTookOver: false },
      transferHit: 0,
    });
  });

  test("the top contributor counts the captain's multiplier, and only a clear leader is named", () => {
    expect(buildGameweekRecap(result(SQUAD), "T")?.topContributor).toEqual({
      playerId: "c",
      counted: 16,
    });
    const tie: Row[] = [
      { id: "c", points: 5, multiplier: 2 },
      { id: "a", points: 10, multiplier: 1 },
    ];
    expect(buildGameweekRecap(result(tie), "T")?.topContributor).toBeNull();
  });

  test("a bench player who did not count is never the top contributor", () => {
    const rows: Row[] = [
      { id: "c", points: 2, multiplier: 2 },
      { id: "x", points: 15, multiplier: 0, bench: true },
    ];
    expect(buildGameweekRecap(result(rows), "T")?.topContributor?.playerId).toBe("c");
  });

  test("transfer cost and Bench Boost are part of the sum, not counted twice", () => {
    const recap = buildGameweekRecap(
      result(
        SQUAD.map((row) => (row.bench ? { ...row, multiplier: 1 } : row)),
        { transferHit: 4, chipType: "bench_boost" },
      ),
      "T",
    );
    expect(recap?.reconciled).toBe(true);
    expect(recap?.total).toBe(8 + 11 + 2 + 5 + 8 - 4);
    expect(recap?.transferHit).toBe(4);
    expect(recap?.chipType).toBe("bench_boost");
  });

  test("triple captain: counted is points × 3, bonus × 2", () => {
    const rows: Row[] = [
      { id: "c", points: 7, multiplier: 3 },
      { id: "a", points: 1, multiplier: 1 },
    ];
    const recap = buildGameweekRecap(result(rows, { chipType: "triple_captain" }), "T");
    expect(recap?.captain?.counted).toBe(21);
    expect(recap?.total).toBe(7 + 1 + 14);
  });

  test("the recap total is exactly the points screen's total", () => {
    for (const fixture of [
      result(SQUAD),
      result(SQUAD, { transferHit: 4 }),
      result(SQUAD, { gameweekStatus: "corrected" }),
      result([{ id: "c", points: 0, multiplier: 2 }], { transferHit: 8 }),
    ]) {
      expect(buildGameweekRecap(fixture, "T")?.total).toBe(
        buildServerPointsViewModel(fixture).totalPoints,
      );
    }
  });

  test("the vice taking the armband is said as such", () => {
    expect(buildGameweekRecap(result(SQUAD, {}, "someone-else"), "T")?.captain?.viceTookOver).toBe(
      true,
    );
  });

  test("zero and negative totals are shown as they are", () => {
    const rows: Row[] = [{ id: "c", points: 0, multiplier: 2 }];
    expect(buildGameweekRecap(result(rows), "T")?.total).toBe(0);
    expect(buildGameweekRecap(result(rows, { transferHit: 8 }), "T")?.total).toBe(-8);
    expect(buildGameweekRecap(result(rows), "T")?.topContributor).toBeNull();
  });

  test("figures that do not add up: total only, no captain, no contributor", () => {
    const recap = buildGameweekRecap(result(SQUAD, { finalScore: 99 }), "T");
    expect(recap).toMatchObject({ total: 99, reconciled: false, captain: null, transferHit: 0 });
    expect(recap?.topContributor).toBeNull();
  });

  test("a captain bonus that disagrees with the player's points drops the captain line", () => {
    const base = result(SQUAD);
    const bad = result(SQUAD, {
      captainPoints: 7,
      finalScore: base.authoritative!.finalScore! - 1,
    });
    const recap = buildGameweekRecap(bad, "T");
    expect(recap?.reconciled).toBe(true);
    expect(recap?.captain).toBeNull();
  });

  test("a corrected result is flagged", () => {
    expect(buildGameweekRecap(result(SQUAD, { gameweekStatus: "corrected" }), "T")?.corrected).toBe(
      true,
    );
  });

  test("provisional, missing or mock results give no recap", () => {
    expect(buildGameweekRecap(result(SQUAD, { finalized: false }), "T")).toBeNull();
    expect(buildGameweekRecap(result(SQUAD, { finalScore: null }), "T")).toBeNull();
    expect(buildGameweekRecap(undefined, "T")).toBeNull();
    const mock = { ...result(SQUAD), authoritative: undefined };
    expect(buildGameweekRecap(mock, "T")).toBeNull();
  });
});
