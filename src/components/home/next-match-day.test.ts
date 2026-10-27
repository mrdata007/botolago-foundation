import { describe, expect, it } from "bun:test";

import type { Match } from "@/types/domain";
import { nextMatchDay } from "./next-match-day";

const match = (id: string, kickoff: string, status: Match["status"] = "scheduled"): Match =>
  ({
    id,
    gameweek: 6,
    homeClubId: "a",
    awayClubId: "b",
    kickoff,
    status,
    venue: { fr: "", ar: "" },
  }) as Match;

// Monday 26 October 2026, midday in Casablanca (UTC+1).
const now = new Date("2026-10-26T11:00:00Z");

describe("nextMatchDay", () => {
  it("names the first match day when none is today", () => {
    expect(
      nextMatchDay([match("2", "2026-10-29T19:00:00Z"), match("1", "2026-10-28T17:00:00Z")], now),
    ).toBe("2026-10-28");
  });

  it("is null when a match is today or live", () => {
    expect(nextMatchDay([match("1", "2026-10-26T19:00:00Z")], now)).toBeNull();
    expect(nextMatchDay([match("1", "2026-10-25T19:00:00Z", "live")], now)).toBeNull();
  });

  it("is null with nothing scheduled ahead, and skips postponed fixtures", () => {
    expect(nextMatchDay([], now)).toBeNull();
    expect(nextMatchDay([match("1", "2026-10-28T19:00:00Z", "postponed")], now)).toBeNull();
  });
});
