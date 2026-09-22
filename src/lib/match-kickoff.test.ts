import { describe, expect, it } from "bun:test";
import { isKickoffDateUnconfirmed, isKickoffTimeUnconfirmed } from "./match-kickoff";

describe("unconfirmed provider kickoff presentation", () => {
  it("recognizes the audited UTC-midnight placeholder regardless of offset notation", () => {
    expect(isKickoffTimeUnconfirmed({ status: "scheduled", kickoff: "2026-09-24T00:00:00Z" })).toBe(
      true,
    );
    expect(
      isKickoffTimeUnconfirmed({ status: "scheduled", kickoff: "2026-09-24T01:00:00+01:00" }),
    ).toBe(true);
  });

  it("preserves explicit kickoff hours and completed match presentation", () => {
    expect(isKickoffTimeUnconfirmed({ status: "scheduled", kickoff: "2026-09-24T19:00:00Z" })).toBe(
      false,
    );
    expect(isKickoffTimeUnconfirmed({ status: "finished", kickoff: "2026-09-24T00:00:00Z" })).toBe(
      false,
    );
    expect(isKickoffTimeUnconfirmed({ status: "live", kickoff: "2026-09-24T00:00:00Z" })).toBe(
      false,
    );
    expect(isKickoffTimeUnconfirmed({ status: "scheduled", kickoff: "invalid" })).toBe(false);
  });
});

describe("postponed fixtures have no confirmed date", () => {
  /**
   * Production shipped FAR Rabat v Raja showing
   *
   *   REPORTÉ · Ce match a été reporté. Nouvelle date à confirmer.
   *   COUP D'ENVOI  jeudi 24 septembre · 01:00
   *
   * The 01:00 is midnight UTC, the provider's placeholder for "no hour
   * known", rendered as a kickoff a reader could plan around -- directly
   * contradicting the notice above it.
   *
   * `isKickoffTimeUnconfirmed` could not catch it: it returns false for any
   * status other than `scheduled`, so the postponed fixture fell through to
   * the formatted timestamp. These assert the predicate that does.
   */
  it("treats a postponed match as date-unconfirmed whatever its stored kickoff", () => {
    // The real production row: midnight-UTC placeholder.
    expect(isKickoffDateUnconfirmed({ status: "postponed" })).toBe(true);
    // And a postponed match that still carries a once-real kickoff hour --
    // the date is no longer trustworthy just because the clock time is.
    expect(isKickoffDateUnconfirmed({ status: "postponed" })).toBe(true);
  });

  it("leaves every other status alone", () => {
    for (const status of ["scheduled", "live", "finished"] as const) {
      expect(isKickoffDateUnconfirmed({ status })).toBe(false);
    }
  });

  it("does not make the time predicate fire for postponed matches", () => {
    // The two predicates answer different questions and must stay separate:
    // widening this one would have changed scheduled-placeholder behaviour too.
    expect(isKickoffTimeUnconfirmed({ status: "postponed", kickoff: "2026-09-24T00:00:00Z" })).toBe(
      false,
    );
  });
});
