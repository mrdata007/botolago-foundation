import { describe, expect, test } from "bun:test";

import type { FantasyPlayer, FixtureDifficulty } from "@/types/fantasy";
import {
  buildPlayerDecisionPresentation,
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
        clubId: "club-a",
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

    expect(selectUpcomingFixture("club-a", fixtures)?.opponentClubId).toBe(
      "earlier-kickoff",
    );
    expect(fixtures.map((fixture) => fixture.opponentClubId)).toEqual(
      originalOrder,
    );
  });

  test("returns null when the club has no playable fixture", () => {
    expect(
      selectUpcomingFixture("club-a", [
        {
          clubId: "club-a",
          gameweek: 2,
          opponentClubId: "blank-opponent",
          isHome: true,
          difficulty: 2,
          isBlank: true,
        },
      ]),
    ).toBeNull();
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
