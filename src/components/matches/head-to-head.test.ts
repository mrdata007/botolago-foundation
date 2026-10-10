import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  formatGoalDifference,
  meetingWinner,
  newestFirst,
  summariseHeadToHead,
} from "./head-to-head";

const meeting = (
  homeClubId: string,
  awayClubId: string,
  homeScore: number | undefined,
  awayScore: number | undefined,
  kickoff = "2026-01-01T20:00:00.000Z",
) => ({ homeClubId, awayClubId, homeScore, awayScore, kickoff });

describe("head-to-head summary", () => {
  test("credits a win to the club, whichever side it played on", () => {
    const meetings = [
      meeting("far", "wac", 0, 1), // Wydad wins away
      meeting("wac", "far", 2, 2),
      meeting("wac", "far", 1, 0), // Wydad wins at home
      meeting("far", "wac", 2, 1), // FAR wins at home
      meeting("wac", "far", 0, 0),
    ];
    expect(summariseHeadToHead(meetings, "wac", "far")).toEqual({
      homeWins: 2,
      draws: 2,
      awayWins: 1,
      counted: 5,
    });
    // Asked from the other side, the same meetings read the other way round.
    expect(summariseHeadToHead(meetings, "far", "wac")).toEqual({
      homeWins: 1,
      draws: 2,
      awayWins: 2,
      counted: 5,
    });
  });

  test("a meeting without a score is not counted, and is never a draw", () => {
    expect(meetingWinner(meeting("wac", "far", undefined, undefined))).toBeNull();
    expect(meetingWinner(meeting("wac", "far", 1, undefined))).toBeNull();
    expect(
      summariseHeadToHead([meeting("wac", "far", undefined, undefined)], "wac", "far"),
    ).toEqual({ homeWins: 0, draws: 0, awayWins: 0, counted: 0 });
  });

  test("0 – 0 is a draw", () => {
    expect(meetingWinner(meeting("wac", "far", 0, 0))).toBe("draw");
  });

  test("lists the most recent meeting first, without mutating the input", () => {
    const list = [
      meeting("a", "b", 1, 0, "2024-04-09T20:00:00.000Z"),
      meeting("a", "b", 1, 0, "2026-04-12T20:00:00.000Z"),
      meeting("a", "b", 1, 0, "2025-11-03T20:00:00.000Z"),
    ];
    const copy = [...list];
    expect(newestFirst(list).map((m) => m.kickoff.slice(0, 4))).toEqual(["2026", "2025", "2024"]);
    expect(list).toEqual(copy);
  });
});

describe("a signed goal difference reads left to right in Arabic", () => {
  // "+2" and "-6" hold no letter, so a bare `<bdi>` leaves their order to the
  // engine; under an Arabic parent, one that inherits the direction prints
  // "2+" and "6-". Every place that prints `formatGoalDifference` says
  // `dir="ltr"` itself (PRODUCT.md: numbers stay left to right).
  const root = join(import.meta.dir, "..", "..");
  const callers = [...new Bun.Glob("**/*.tsx").scanSync(root)]
    .filter((file) => !file.includes(".test."))
    .map((file) => ({ file, source: readFileSync(join(root, file), "utf8") }))
    .filter(({ source }) => source.includes("formatGoalDifference("));

  test("prints the sign first", () => {
    expect([formatGoalDifference(14), formatGoalDifference(0), formatGoalDifference(-3)]).toEqual([
      "+14",
      "0",
      "-3",
    ]);
  });

  test("finds the four places that print it", () => {
    expect(callers.map(({ file }) => file.split("/").pop()).sort()).toEqual([
      "ClubHero.tsx",
      "ClubOverview.tsx",
      "HeadToHead.tsx",
      "StandingsTable.tsx",
    ]);
  });

  for (const { file, source } of callers) {
    test(`${file.split("/").pop()}: inside an element with dir="ltr"`, () => {
      for (const match of source.matchAll(/formatGoalDifference\(/g)) {
        // The JSX element the call sits in: the last tag opened before it.
        const before = source.slice(0, match.index);
        const tag = before.slice(before.lastIndexOf("<"));
        const name = tag.split(/[\s>]/)[0];
        if (name === "<KeyNumber") {
          // A value on the club page's key-numbers card, which isolates every
          // value left to right.
          expect(source).toContain('<bdi dir="ltr">{value}</bdi>');
        } else {
          expect({ file, name, ltr: tag.includes('dir="ltr"') }).toEqual({ file, name, ltr: true });
        }
      }
    });
  }
});
