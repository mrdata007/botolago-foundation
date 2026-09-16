import { describe, expect, test } from "bun:test";

import type { FantasyPlayer, FixtureDifficulty } from "@/types/fantasy";
import {
  buildPlayerDecisionPresentation,
  getPlayerFixtureFallbackKey,
  selectUpcomingFixture,
} from "./player-decision-presentation";

const player: FantasyPlayer = {
  id: "player-1",
  name: { fr: "Youssef Atlas", ar: "يوسف أطلس" },
  clubId: "club-a",
  position: "MID",
  price: 7.5,
  totalPoints: 91,
  form: 6.2,
  ownership: 14.5,
  status: "doubtful",
  expectedPoints: 5.8,
  chanceOfPlaying: 50,
};

describe("selectUpcomingFixture", () => {
  test("chooses the earliest real fixture without mutating the input", () => {
    const fixtures: FixtureDifficulty[] = [
      {
        clubId: "club-b",
        gameweek: 1,
        opponentClubId: "blank-opponent",
        isHome: true,
        difficulty: 1,
        isBlank: true,
      },
      {
        clubId: "club-a",
        gameweek: 3,
        opponentClubId: "later-gameweek",
        isHome: false,
        difficulty: 4,
        kickoffAt: "2026-08-22T20:00:00Z",
      },
      {
        clubId: "club-a",
        gameweek: 2,
        opponentClubId: "later-kickoff",
        isHome: false,
        difficulty: 3,
        kickoffAt: "2026-08-15T20:00:00Z",
      },
      {
        clubId: "club-a",
        gameweek: 2,
        opponentClubId: "earlier-kickoff",
        isHome: true,
        difficulty: 2,
        kickoffAt: "2026-08-15T18:00:00Z",
      },
    ];
    const originalOrder = fixtures.map((fixture) => fixture.opponentClubId);

    expect(
      selectUpcomingFixture("club-a", fixtures, Date.parse("2026-08-01T00:00:00Z"))?.opponentClubId,
    ).toBe("earlier-kickoff");
    expect(fixtures.map((fixture) => fixture.opponentClubId)).toEqual(originalOrder);
  });

  test("excludes fixtures that have already kicked off", () => {
    const fixtures: FixtureDifficulty[] = [
      {
        clubId: "club-a",
        gameweek: 2,
        opponentClubId: "live-opponent",
        isHome: true,
        difficulty: 2,
        kickoffAt: "2026-08-05T18:00:00Z",
      },
      {
        clubId: "club-a",
        gameweek: 2,
        opponentClubId: "future-opponent",
        isHome: false,
        difficulty: 3,
        kickoffAt: "2026-08-06T18:00:00Z",
      },
    ];

    expect(
      selectUpcomingFixture("club-a", fixtures, Date.parse("2026-08-05T18:00:00Z"))?.opponentClubId,
    ).toBe("future-opponent");
  });

  test("keeps a fixture with no authoritative kickoff instead of assuming it is finished", () => {
    const fixture: FixtureDifficulty = {
      clubId: "club-a",
      gameweek: 2,
      opponentClubId: "tbd-opponent",
      isHome: true,
      difficulty: 2,
    };

    expect(selectUpcomingFixture("club-a", [fixture], Date.parse("2026-08-05T18:00:00Z"))).toEqual(
      fixture,
    );
  });

  test("preserves blank and double gameweek decision signals", () => {
    const blank: FixtureDifficulty = {
      clubId: "club-a",
      gameweek: 2,
      opponentClubId: "blank-opponent",
      isHome: true,
      difficulty: 2,
      isBlank: true,
    };
    const double: FixtureDifficulty = {
      clubId: "club-a",
      gameweek: 3,
      opponentClubId: "double-opponent",
      isHome: false,
      difficulty: 3,
      isDouble: true,
    };

    expect(selectUpcomingFixture("club-a", [double, blank])).toEqual(blank);
    expect(selectUpcomingFixture("club-a", [double])).toEqual(double);
  });

  test("returns null when the club has no fixture context", () => {
    expect(selectUpcomingFixture("club-a", [])).toBeNull();
  });

  test("maps query states to honest fixture fallback copy", () => {
    expect(getPlayerFixtureFallbackKey("loading")).toBe("fantasy.players.fixture_loading");
    expect(getPlayerFixtureFallbackKey("error")).toBe("fantasy.players.fixture_error");
    expect(getPlayerFixtureFallbackKey("ready")).toBe("fantasy.players.no_fixture");
  });
});

describe("buildPlayerDecisionPresentation", () => {
  test("keeps reliable fields while hiding unverified performance data by default", () => {
    const presentation = buildPlayerDecisionPresentation({ player });

    expect({
      id: presentation.id,
      clubId: presentation.clubId,
      position: presentation.position,
      price: presentation.price,
      status: presentation.status,
    }).toEqual({
      id: "player-1",
      clubId: "club-a",
      position: "MID",
      price: 7.5,
      status: "doubtful",
    });
    expect(presentation.performance).toEqual({});
    expect("chanceOfPlaying" in presentation).toBe(false);
  });

  test("preserves non-medical availability statuses", () => {
    for (const status of ["unavailable", "ineligible"] as const) {
      expect(buildPlayerDecisionPresentation({ player: { ...player, status } }).status).toBe(
        status,
      );
    }
  });

  test("includes only metrics whose availability is explicitly confirmed", () => {
    const presentation = buildPlayerDecisionPresentation({
      player,
      performanceAvailability: {
        totalPoints: true,
        form: false,
        ownership: true,
      },
    });

    expect(presentation.performance).toEqual({
      totalPoints: 91,
      ownership: 14.5,
    });
  });

  test("does not mistake zero for unavailable when a source explicitly confirms it", () => {
    const presentation = buildPlayerDecisionPresentation({
      player: {
        ...player,
        totalPoints: 0,
        form: 0,
        ownership: 0,
        expectedPoints: 0,
      },
      performanceAvailability: {
        totalPoints: true,
        form: true,
        ownership: true,
        expectedPoints: true,
      },
    });

    expect(presentation.performance).toEqual({
      totalPoints: 0,
      form: 0,
      ownership: 0,
      expectedPoints: 0,
    });
  });
});
