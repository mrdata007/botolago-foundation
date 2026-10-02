import { describe, expect, test } from "bun:test";

import { bandGameweek } from "./band-gameweek";

const now = Date.parse("2026-10-01T12:00:00Z");
const ahead = "2026-10-02T13:30:00Z";
const past = "2026-09-24T13:30:00Z";

describe("bandGameweek", () => {
  test("uses Fantasy's gameweek while its deadline is ahead", () => {
    expect(bandGameweek({ number: 2, deadline: ahead, isCurrent: true }, 2, now)).toBe(2);
  });

  test("follows the next fixture once Fantasy's gameweek is over", () => {
    expect(bandGameweek({ number: 1, deadline: past, isCurrent: false }, 2, now)).toBe(2);
  });

  test("follows the next fixture when the deadline has passed", () => {
    expect(bandGameweek({ number: 1, deadline: past, isCurrent: true }, 2, now)).toBe(2);
  });

  test("falls back to Fantasy's number with no fixture to follow", () => {
    expect(bandGameweek({ number: 1, deadline: past, isCurrent: false }, undefined, now)).toBe(1);
  });

  test("uses the fixture's gameweek when Fantasy has none", () => {
    expect(bandGameweek(undefined, 2, now)).toBe(2);
    expect(bandGameweek(undefined, undefined, now)).toBeUndefined();
  });
});
