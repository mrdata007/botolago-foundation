import { describe, expect, test } from "bun:test";
import { moroccoDayBounds } from "@/lib/morocco-time";
import { matchDayRange } from "./supabase-repository";

const inDay = (kickoff: string, range: { p_range_start?: string; p_range_end?: string }) =>
  kickoff >= range.p_range_start! && kickoff < range.p_range_end!;

describe("matchDayRange: the app sends the day's exact UTC bounds", () => {
  test("after the clock change a Moroccan day is the UTC day", () => {
    expect(matchDayRange({ date: "2026-10-02" })).toEqual({
      p_range_start: "2026-10-02T00:00:00.000Z",
      p_range_end: "2026-10-03T00:00:00.000Z",
    });
  });

  test("a kickoff between 23:00 and 24:00 UTC is on its own UTC day, not the next", () => {
    const kickoff = "2026-10-02T23:30:00.000Z";
    expect(inDay(kickoff, matchDayRange({ date: "2026-10-02" }))).toBe(true);
    expect(inDay(kickoff, matchDayRange({ date: "2026-10-03" }))).toBe(false);
  });

  test("before the change a Moroccan day starts at 23:00 UTC the evening before", () => {
    const range = matchDayRange({ date: "2026-09-10" });
    expect(range).toEqual({
      p_range_start: "2026-09-09T23:00:00.000Z",
      p_range_end: "2026-09-10T23:00:00.000Z",
    });
    // 23:30 UTC on the 9th is 00:30 on the 10th in Morocco then.
    expect(inDay("2026-09-09T23:30:00.000Z", range)).toBe(true);
    expect(inDay("2026-09-10T23:30:00.000Z", range)).toBe(false);
  });

  test("the day the clock changes is 25 hours long and nothing falls between days", () => {
    const change = moroccoDayBounds("2026-09-20")!;
    expect((change.end.getTime() - change.start.getTime()) / 3_600_000).toBe(25);
    const previous = moroccoDayBounds("2026-09-19")!;
    const following = moroccoDayBounds("2026-09-21")!;
    expect(previous.end.getTime()).toBe(change.start.getTime());
    expect(change.end.getTime()).toBe(following.start.getTime());
  });

  test("another zone, or a bad date, keeps the old date-and-zone path", () => {
    expect(matchDayRange({ date: "2026-10-02", timezone: "Europe/Paris" })).toEqual({});
    expect(matchDayRange({ date: "2026-13-45" })).toEqual({});
    expect(matchDayRange({ date: "not-a-date" })).toEqual({});
  });
});
