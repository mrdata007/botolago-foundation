import { describe, expect, test } from "bun:test";

import {
  LIVE_STRIP_IDLE_REFRESH_MS,
  liveStripRefetchInterval,
  matchesRefetchInterval,
  matchRefetchInterval,
} from "./match-refresh";

describe("matchRefetchInterval", () => {
  const kickoff = "2026-09-24T19:00:00Z";
  const at = (iso: string) => Date.parse(iso);

  test("every 30 seconds while live", () => {
    expect(matchRefetchInterval({ status: "live", kickoff }, at(kickoff))).toBe(30_000);
  });

  test("every minute from 15 minutes before a scheduled kick-off", () => {
    expect(matchRefetchInterval({ status: "scheduled", kickoff }, at("2026-09-24T18:44:00Z"))).toBe(
      false,
    );
    expect(matchRefetchInterval({ status: "scheduled", kickoff }, at("2026-09-24T18:46:00Z"))).toBe(
      60_000,
    );
    // Past kick-off and still "scheduled": the provider has not flipped it yet.
    expect(matchRefetchInterval({ status: "scheduled", kickoff }, at("2026-09-24T19:05:00Z"))).toBe(
      60_000,
    );
  });

  test("stops three hours past kick-off, and never for finished or postponed matches", () => {
    expect(matchRefetchInterval({ status: "scheduled", kickoff }, at("2026-09-24T22:01:00Z"))).toBe(
      false,
    );
    expect(matchRefetchInterval({ status: "finished", kickoff }, at(kickoff))).toBe(false);
    expect(matchRefetchInterval({ status: "postponed", kickoff }, at(kickoff))).toBe(false);
    expect(matchRefetchInterval(undefined, at(kickoff))).toBe(false);
    expect(matchRefetchInterval({ status: "scheduled", kickoff: "tbd" }, at(kickoff))).toBe(false);
  });
});

describe("matchesRefetchInterval", () => {
  const now = Date.parse("2026-09-24T18:50:00Z");

  test("the shortest any match asks for", () => {
    expect(
      matchesRefetchInterval(
        [
          { status: "scheduled", kickoff: "2026-09-24T19:00:00Z" },
          { status: "live", kickoff: "2026-09-24T18:00:00Z" },
        ],
        now,
      ),
    ).toBe(30_000);
  });

  test("a match about to kick off keeps Home refreshing, so it becomes the live card", () => {
    expect(
      matchesRefetchInterval([{ status: "scheduled", kickoff: "2026-09-24T19:00:00Z" }], now),
    ).toBe(60_000);
  });

  test("nothing live or near: no refresh", () => {
    expect(
      matchesRefetchInterval([{ status: "scheduled", kickoff: "2026-09-25T19:00:00Z" }], now),
    ).toBe(false);
    expect(matchesRefetchInterval([], now)).toBe(false);
    expect(matchesRefetchInterval(undefined, now)).toBe(false);
  });
});

describe("liveStripRefetchInterval", () => {
  test("follows the score every 30 seconds while a match is live", () => {
    expect(liveStripRefetchInterval(2)).toBe(30_000);
  });

  test("keeps a slow watch with nothing live, so a match that starts brings the strip up", () => {
    expect(liveStripRefetchInterval(0)).toBe(LIVE_STRIP_IDLE_REFRESH_MS);
  });
});
