import { describe, expect, test } from "bun:test";
import {
  LIVE_BREAK_DATA_QUIET_AFTER_MS,
  LIVE_DATA_QUIET_AFTER_MS,
  LIVE_EXPIRED_AFTER_KICKOFF_MS,
  LIVE_STALE_AFTER_MS,
  RETURN_REFETCH_AFTER_MS,
  freshnessSince,
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

  test("a fresh read AND fresh data: still live three hours on, it shows live", () => {
    // A long delay, extra time and penalties: the server still says live, and
    // its data was written a minute ago.
    const longMatch = {
      ...live,
      period: "extra_time" as const,
      dataUpdatedAt: new Date(at(200)).toISOString(),
    };
    expect(liveFreshness(longMatch, at(200), at(201))).toBe("fresh");
  });

  test("an unknown read time is not an alarm", () => {
    expect(liveFreshness(live, 0, at(60))).toBe("fresh");
    const written = {
      ...live,
      period: "second_half" as const,
      dataUpdatedAt: new Date(at(499)).toISOString(),
    };
    expect(liveFreshness(written, 0, at(500))).toBe("fresh");
  });

  test("an unreadable kickoff never expires a read, it only goes stale", () => {
    expect(liveFreshness({ ...live, kickoff: "not a date" }, at(0), at(500))).toBe("stale");
  });
});

// Audit 2026-10-14, DATA-01: every successful read used to reset the clock, so
// an old live fixture that the API kept returning looked live forever.
describe("liveFreshness on the age of the data, not of the read", () => {
  const AUDIT_KICKOFF = Date.parse("2026-10-14T12:00:00Z");
  const AUDIT_NOW = Date.parse("2026-10-14T18:00:00Z");
  const audit = { status: "live" as const, kickoff: new Date(AUDIT_KICKOFF).toISOString() };
  const iso = (ms: number) => new Date(ms).toISOString();

  test("the audit's fixture: live since 12:00, read at 18:00, is not fresh", () => {
    // updatedAt = now used to say "fresh". Without any data timestamp the page
    // falls back on the kickoff: no match is still on six hours later.
    expect(liveFreshness(audit, AUDIT_NOW, AUDIT_NOW)).toBe("expired");
    expect(liveFreshness(audit, AUDIT_NOW - 180_000, AUDIT_NOW)).toBe("expired");
  });

  test("a read that landed a second ago does not vouch for data written hours ago", () => {
    const old = {
      ...audit,
      period: "second_half" as const,
      dataUpdatedAt: iso(AUDIT_KICKOFF + 3_600_000),
    };
    expect(liveFreshness(old, AUDIT_NOW, AUDIT_NOW)).toBe("expired");
  });

  test("a fresh live fixture with fresh data is fresh", () => {
    const fresh = {
      ...live,
      period: "second_half" as const,
      dataUpdatedAt: iso(at(60) - 45_000),
    };
    expect(liveFreshness(fresh, at(60), at(60))).toBe("fresh");
  });

  test("provider-stale but read-fresh is not fresh, and only stale before three hours", () => {
    expect(LIVE_DATA_QUIET_AFTER_MS).toBe(5 * 60_000);
    const quiet = {
      ...live,
      period: "second_half" as const,
      dataUpdatedAt: iso(at(60) - LIVE_DATA_QUIET_AFTER_MS - 1),
    };
    expect(liveFreshness(quiet, at(60), at(60))).toBe("stale");
    const justInside = { ...quiet, dataUpdatedAt: iso(at(60) - LIVE_DATA_QUIET_AFTER_MS) };
    expect(liveFreshness(justInside, at(60), at(60))).toBe("fresh");
  });

  test("a feed quiet for hours, read fresh, past three hours: the neutral state", () => {
    const frozen = { ...live, period: "second_half" as const, dataUpdatedAt: iso(at(70)) };
    expect(liveFreshness(frozen, at(230), at(230))).toBe("expired");
    expect(liveFreshness(frozen, at(120), at(120))).toBe("stale");
  });

  test("half-time is quiet by nature: the data is not written while nothing changes", () => {
    expect(LIVE_BREAK_DATA_QUIET_AFTER_MS).toBe(30 * 60_000);
    const halfTime = { ...live, period: "half_time" as const, dataUpdatedAt: iso(at(46)) };
    expect(liveFreshness(halfTime, at(62), at(62))).toBe("fresh");
    expect(
      liveFreshness(
        halfTime,
        at(46) + LIVE_BREAK_DATA_QUIET_AFTER_MS + 1,
        at(46) + LIVE_BREAK_DATA_QUIET_AFTER_MS + 1,
      ),
    ).toBe("stale");
  });

  test("a read that is itself old is still stale, whatever the data says", () => {
    const fresh = { ...live, period: "second_half" as const, dataUpdatedAt: iso(at(60)) };
    expect(liveFreshness(fresh, at(60), at(60) + LIVE_STALE_AFTER_MS + 1)).toBe("stale");
  });

  test("a data timestamp from the future is not a reason to doubt the data", () => {
    const skewed = { ...live, period: "second_half" as const, dataUpdatedAt: iso(at(60) + 30_000) };
    expect(liveFreshness(skewed, at(60), at(60))).toBe("fresh");
  });

  test("an unreadable data timestamp counts as none", () => {
    const broken = { ...live, period: "second_half" as const, dataUpdatedAt: "not a date" };
    expect(liveFreshness(broken, at(60), at(60))).toBe("fresh");
    expect(liveFreshness(broken, at(230), at(230))).toBe("expired");
  });

  test("a match that is not live is untouched, however old its data", () => {
    for (const status of ["scheduled", "finished", "postponed"] as const) {
      const old = { ...audit, status, dataUpdatedAt: iso(AUDIT_KICKOFF) };
      expect(liveFreshness(old, AUDIT_NOW, AUDIT_NOW)).toBe("not_live");
    }
  });
});

describe("freshnessSince", () => {
  test("names the older of the read and the data: the last moment the page can vouch for", () => {
    const m = { ...live, dataUpdatedAt: new Date(at(40)).toISOString() };
    expect(freshnessSince(m, at(100))).toBe(at(40));
    expect(freshnessSince(m, at(10))).toBe(at(10));
  });

  test("without a data timestamp, or without a read time, it names what it has", () => {
    expect(freshnessSince(live, at(100))).toBe(at(100));
    const m = { ...live, dataUpdatedAt: new Date(at(40)).toISOString() };
    expect(freshnessSince(m, 0)).toBe(at(40));
    expect(freshnessSince(live, 0)).toBe(0);
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
