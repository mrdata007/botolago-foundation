import { describe, expect, it } from "bun:test";
import { presentGameweek, presentMatchScore } from "./match-score-presentation";

describe("match score presentation", () => {
  it("does not turn a missing finished score into 0–0", () => {
    expect(presentMatchScore({ homeScore: undefined, awayScore: undefined })).toEqual({
      available: false,
      home: null,
      away: null,
    });
  });

  it("fails the whole score closed when only one side is available", () => {
    expect(presentMatchScore({ homeScore: 2, awayScore: undefined }).available).toBe(false);
    expect(presentMatchScore({ homeScore: undefined, awayScore: 1 }).available).toBe(false);
  });

  it("preserves a legitimate goalless result", () => {
    expect(presentMatchScore({ homeScore: 0, awayScore: 0 })).toEqual({
      available: true,
      home: 0,
      away: 0,
    });
  });

  it("rejects malformed negative, fractional, and unsafe scores", () => {
    expect(presentMatchScore({ homeScore: -1, awayScore: 0 }).available).toBe(false);
    expect(presentMatchScore({ homeScore: 1.5, awayScore: 0 }).available).toBe(false);
    expect(
      presentMatchScore({ homeScore: Number.MAX_SAFE_INTEGER + 1, awayScore: 0 }).available,
    ).toBe(false);
  });
});

describe("gameweek presentation", () => {
  it("hides missing and nonpositive provider fallbacks", () => {
    expect(presentGameweek(undefined)).toBeNull();
    expect(presentGameweek(null)).toBeNull();
    expect(presentGameweek(0)).toBeNull();
    expect(presentGameweek(-2)).toBeNull();
  });

  it("shows only positive integer gameweeks", () => {
    expect(presentGameweek(1)).toBe(1);
    expect(presentGameweek(30)).toBe(30);
    expect(presentGameweek(2.5)).toBeNull();
  });
});
