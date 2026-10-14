import { describe, expect, test } from "bun:test";
import {
  LIVE_EXPIRED_AFTER_KICKOFF_MS,
  LIVE_STALE_AFTER_MS,
  RETURN_REFETCH_AFTER_MS,
  liveFreshness,
  shouldRefetchOnReturn,
} from "./match-freshness";

// 2026-10-13: FUS Rabat - Raja kicked off at 20:00 UTC; a page left open read
// "EN DIRECT 0–1" hours after the 1–1 full time.
const KICKOFF = Date.parse("2026-10-13T20:00:00Z");
const live = { status: "live" as const, kickoff: new Date(KICKOFF).toISOString() };
const at = (minutes: number) => KICKOFF + minutes * 60_000;

describe("liveFreshness", () => {
  test("a match that is not live has nothing to say", () => {
    for (const status of ["scheduled", "finished", "postponed", "cancelled"] as const) {
      expect(liveFreshness({ ...live, status }, at(0), at(500))).toBe("not_live");
    }
    expect(liveFreshness(undefined, at(0), at(1))).toBe("not_live");
  });

  test("fresh up to two minutes after the last read, stale after", () => {
    expect(LIVE_STALE_AFTER_MS).toBe(120_000);
    expect(liveFreshness(live, at(30), at(30))).toBe("fresh");
    expect(liveFreshness(live, at(30), at(30) + LIVE_STALE_AFTER_MS)).toBe("fresh");
    expect(liveFreshness(live, at(30), at(30) + LIVE_STALE_AFTER_MS + 1)).toBe("stale");
  });

  test("a stale read more than three hours after kickoff is expired", () => {
    expect(LIVE_EXPIRED_AFTER_KICKOFF_MS).toBe(3 * 3_600_000);
    // The owner's page: last read during the first half, looked at at 23:30.
    expect(liveFreshness(live, at(25), at(210))).toBe("expired");
    expect(liveFreshness(live, at(25), at(180))).toBe("stale");
    expect(liveFreshness(live, at(25), at(180) + 1)).toBe("expired");
  });

  test("only a fresh read is trusted: still live three hours on, it shows live", () => {
    // A long delay, extra time and penalties: the server still says live.
    expect(liveFreshness(live, at(200), at(201))).toBe("fresh");
  });

  test("an unknown read time is not an alarm", () => {
    expect(liveFreshness(live, 0, at(500))).toBe("fresh");
  });

  test("an unreadable kickoff never expires a read, it only goes stale", () => {
    expect(liveFreshness({ ...live, kickoff: "not a date" }, at(0), at(500))).toBe("stale");
  });
});

describe("shouldRefetchOnReturn", () => {
  test("a live read older than 15 seconds is read again when the reader comes back", () => {
    expect(RETURN_REFETCH_AFTER_MS).toBe(15_000);
    expect(shouldRefetchOnReturn(live, at(10), at(10) + 15_000)).toBe(false);
    expect(shouldRefetchOnReturn(live, at(10), at(10) + 15_001)).toBe(true);
    expect(shouldRefetchOnReturn({ status: "finished" }, at(10), at(400))).toBe(false);
    expect(shouldRefetchOnReturn(undefined, at(10), at(400))).toBe(false);
  });
});
