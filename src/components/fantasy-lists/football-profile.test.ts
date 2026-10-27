import { describe, expect, test } from "bun:test";

import type { FootballPlayerSeasonProfileDto } from "@/backend/fantasy/contracts";
import { footballPlayerSeasonProfileSchema } from "@/backend/fantasy/contracts";

import { clubScore, matchOutcome, partialCoverage } from "./football-profile";

type LastMatch = FootballPlayerSeasonProfileDto["lastMatches"][number];

const match = (over: Partial<LastMatch>): LastMatch => ({
  fixtureId: "11111111-1111-4111-8111-111111111111",
  kickoffAt: "2026-10-12T18:00:00+00:00",
  home: true,
  opponent: { teamId: "22222222-2222-4222-8222-222222222222", shortName: "FAR", name: "FAR Rabat" },
  homeScore: 2,
  awayScore: 1,
  minutes: 90,
  started: true,
  goals: 0,
  assists: 0,
  rating: 7.5,
  ...over,
});

describe("clubScore", () => {
  test("puts the player's club first, home or away", () => {
    expect(clubScore(match({ home: true, homeScore: 2, awayScore: 1 }))).toEqual({
      own: 2,
      other: 1,
    });
    expect(clubScore(match({ home: false, homeScore: 2, awayScore: 5 }))).toEqual({
      own: 5,
      other: 2,
    });
  });

  test("a fixture with no score has none", () => {
    expect(clubScore(match({ homeScore: null, awayScore: null }))).toBeNull();
  });
});

describe("matchOutcome", () => {
  test("reads the result from the player's side", () => {
    expect(matchOutcome(match({ home: true, homeScore: 2, awayScore: 1 }))).toBe("win");
    expect(matchOutcome(match({ home: false, homeScore: 2, awayScore: 1 }))).toBe("loss");
    expect(matchOutcome(match({ home: false, homeScore: 2, awayScore: 2 }))).toBe("draw");
  });

  test("is null without a score, not a draw", () => {
    expect(matchOutcome(match({ homeScore: null, awayScore: null }))).toBeNull();
  });
});

describe("partialCoverage", () => {
  test("admits a gap", () => {
    expect(partialCoverage({ covered: 4, finished: 5 })).toEqual({ covered: 4, finished: 5 });
  });

  test("says nothing when complete, or when the club has played nothing", () => {
    expect(partialCoverage({ covered: 5, finished: 5 })).toBeNull();
    expect(partialCoverage({ covered: 0, finished: 0 })).toBeNull();
  });
});

describe("footballPlayerSeasonProfileSchema", () => {
  const payload = {
    coverage: { covered: "2", finished: 3 },
    totals: {
      appearances: 2,
      starts: 1,
      minutes: 110,
      goals: 1,
      assists: 1,
      assistsMissing: 1,
      yellowCards: 1,
      redCards: 0,
      averageRating: 7.5,
      ratedMatches: 1,
    },
    lastMatches: [
      {
        fixtureId: "11111111-1111-4111-8111-111111111111",
        kickoffAt: "2026-10-12T18:00:00+00:00",
        home: false,
        opponent: {
          teamId: "22222222-2222-4222-8222-222222222222",
          shortName: "FAR",
          name: "FAR Rabat",
        },
        homeScore: 0,
        awayScore: 0,
        minutes: 20,
        started: false,
        goals: 0,
        assists: null,
        rating: null,
      },
    ],
  };

  test("accepts the RPC payload and keeps a missing rating null, never 0", () => {
    const parsed = footballPlayerSeasonProfileSchema.parse(payload);
    expect(parsed.coverage.covered).toBe(2);
    expect(parsed.lastMatches[0]!.rating).toBeNull();
    expect(parsed.lastMatches[0]!.assists).toBeNull();
    expect(parsed.totals.assistsMissing).toBe(1);
  });

  test("keeps a null average rating null", () => {
    const parsed = footballPlayerSeasonProfileSchema.parse({
      ...payload,
      totals: { ...payload.totals, averageRating: null, ratedMatches: 0 },
    });
    expect(parsed.totals.averageRating).toBeNull();
  });

  test("rejects a payload without coverage", () => {
    const { coverage: _coverage, ...rest } = payload;
    expect(footballPlayerSeasonProfileSchema.safeParse(rest).success).toBe(false);
  });
});
