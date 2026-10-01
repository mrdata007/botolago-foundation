import { describe, expect, test } from "bun:test";

import { homeBandMatchday } from "@/lib/home-matchday";

const match = (gameweek: number, kickoff: string, extra: Record<string, unknown> = {}) => ({
  gameweek,
  kickoff,
  status: "scheduled" as const,
  ...extra,
});

describe("homeBandMatchday", () => {
  test("names the round of the next match, not Fantasy's still-open previous round", () => {
    // 1 Oct 2026: Fantasy still says round 1 (not finalized); fixtures are round 2.
    const upcoming = [match(2, "2026-10-02T16:00:00Z"), match(2, "2026-10-03T18:00:00Z")];
    expect(homeBandMatchday(upcoming, 1)).toBe(2);
  });

  test("takes the earliest kickoff, whatever order the list arrives in", () => {
    const upcoming = [match(3, "2026-10-20T16:00:00Z"), match(2, "2026-10-02T16:00:00Z")];
    expect(homeBandMatchday(upcoming, 1)).toBe(2);
  });

  test("a match being played counts", () => {
    expect(homeBandMatchday([match(2, "2026-10-02T16:00:00Z", { status: "live" })], 1)).toBe(2);
  });

  test("ignores finished, undated and called-off matches", () => {
    const list = [
      match(1, "2026-09-24T00:00:00Z", { status: "finished" }),
      match(1, "2026-09-24T00:00:00Z", { status: "postponed", dateUnconfirmed: true }),
      match(1, "2026-09-25T00:00:00Z", { status: "postponed", calledOff: true }),
      match(0, "2026-09-26T00:00:00Z"),
      match(2, "2026-10-02T16:00:00Z"),
    ];
    expect(homeBandMatchday(list, 1)).toBe(2);
  });

  test("falls back to Fantasy's round when no match can say", () => {
    expect(homeBandMatchday([], 4)).toBe(4);
    expect(homeBandMatchday([], undefined)).toBeUndefined();
  });
});
