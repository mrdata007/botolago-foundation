import { describe, expect, test } from "bun:test";
import { meetingWinner, newestFirst, summariseHeadToHead } from "./head-to-head";

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
