import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  isDayKey,
  seasonSearch,
  validateCalendarSearch,
  validateMatchesSearch,
} from "./matches-search";

describe("the season across the Matches tabs", () => {
  test("reads a season id from the URL, and nothing else", () => {
    expect(validateMatchesSearch({ season: "abc" })).toEqual({ season: "abc" });
    expect(validateMatchesSearch({})).toEqual({});
    expect(validateMatchesSearch({ season: "" })).toEqual({});
    expect(validateMatchesSearch({ season: 2025 })).toEqual({});
    expect(validateMatchesSearch({ season: ["a", "b"] })).toEqual({});
  });

  test("carries a past season to the other tab, and leaves the current one out", () => {
    expect(seasonSearch({ id: "past", isCurrent: false })).toEqual({ season: "past" });
    expect(seasonSearch({ id: "now", isCurrent: true })).toEqual({});
    expect(seasonSearch(undefined)).toEqual({});
  });
});

describe("the day and the chip the calendar keeps in its URL", () => {
  test("reads a real day, a known chip and the season", () => {
    expect(
      validateCalendarSearch({ date: "2026-09-27", status: "finished", season: "s1" }),
    ).toEqual({
      season: "s1",
      date: "2026-09-27",
      status: "finished",
    });
    expect(validateCalendarSearch({ status: "live" })).toEqual({ status: "live" });
    expect(validateCalendarSearch({})).toEqual({});
  });

  test("drops what is not a day or a chip instead of failing the page", () => {
    expect(validateCalendarSearch({ date: "2026-02-31" })).toEqual({});
    expect(validateCalendarSearch({ date: "27/09/2026" })).toEqual({});
    expect(validateCalendarSearch({ date: 20260927 })).toEqual({});
    expect(validateCalendarSearch({ date: "2026-9-7" })).toEqual({});
    // "all" is the default, so it never travels; anything else is unknown.
    expect(validateCalendarSearch({ status: "all" })).toEqual({});
    expect(validateCalendarSearch({ status: "postponed" })).toEqual({});
    expect(validateCalendarSearch({ status: ["live", "finished"] })).toEqual({});
  });

  test("accepts a leap day and refuses the same date in a common year", () => {
    expect(isDayKey("2028-02-29")).toBe(true);
    expect(isDayKey("2027-02-29")).toBe(false);
  });

  test("the calendar page reads them from the route, not from state it would lose on Retour", () => {
    const page = readFileSync(join(import.meta.dir, "../../routes/matches.index.tsx"), "utf8");
    expect(page).toContain("validateSearch: validateCalendarSearch");
    expect(page).not.toMatch(/useState/);
  });
});
