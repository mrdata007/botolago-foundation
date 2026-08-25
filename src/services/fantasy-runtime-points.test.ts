import { describe, expect, it } from "bun:test";
import type {
  FantasyGlobalRankingPageDto,
  FantasyPointsDto,
} from "@/backend/fantasy/contracts";
import { mapFantasyGlobalRankingsDto, mapFantasyPointsDto } from "./fantasy-runtime";

const dto: FantasyPointsDto = {
  teamId: "00000000-0000-4000-8000-000000000001",
  gameweekId: "00000000-0000-4000-8000-000000000002",
  gameweekStatus: "finalized",
  pointsState: "final",
  result: {
    startingPoints: 60,
    benchPoints: 5,
    captainPoints: 16,
    transferHit: 8,
    chipType: "triple_captain",
    provisionalScore: 68,
    finalScore: 68,
    state: "final",
    rank: 12,
    overallRank: 34,
    calculationVersion: 1,
    finalizedAt: "2026-08-07T00:00:00.000Z",
  },
  players: [
    {
      fantasyPlayerId: "00000000-0000-4000-8000-000000000003",
      slot: "starter",
      slotOrder: 1,
      captain: true,
      viceCaptain: false,
      multiplier: 3,
      provisionalPoints: 8,
      finalPoints: 8,
      didPlay: true,
      minutesPlayed: 90,
    },
  ],
};

describe("mapFantasyPointsDto", () => {
  it("keeps the server total and applies its recorded player multiplier once", () => {
    const result = mapFantasyPointsDto(1, dto);

    expect(result?.totalPoints).toBe(68);
    expect(result?.transferHitPoints).toBe(8);
    expect(result?.activeChip).toBe("triple_captain");
    expect(result?.captainId).toBe(dto.players[0].fantasyPlayerId);
    expect(result?.breakdown[0].totalPoints).toBe(24);
    expect(result?.breakdown[0].multiplier).toBe(3);
    expect(result?.finalized).toBe(true);
  });

  it("returns no result before the server has calculated the gameweek", () => {
    expect(mapFantasyPointsDto(1, { ...dto, result: null })).toBeUndefined();
  });
});

describe("mapFantasyGlobalRankingsDto", () => {
  it("maps authoritative rows and defaults a missing previous rank safely", () => {
    const ranking: FantasyGlobalRankingPageDto = {
      items: [
        {
          teamId: "00000000-0000-4000-8000-000000000010",
          teamName: "Atlas Eleven",
          rank: 1,
          previousRank: null,
          totalPoints: 100,
          gameweekPoints: 50,
        },
      ],
      total: 1,
      podium: [],
      myRank: {
        teamId: "00000000-0000-4000-8000-000000000010",
        teamName: "Atlas Eleven",
        rank: 1,
        previousRank: null,
        totalPoints: 100,
        gameweekPoints: 50,
      },
    };

    const result = mapFantasyGlobalRankingsDto(ranking);

    expect(result.rows[0]).toEqual({
      managerId: ranking.items[0].teamId,
      managerName: "",
      teamName: "Atlas Eleven",
      rank: 1,
      previousRank: 1,
      totalScore: 100,
      gameweekScore: 50,
    });
    expect(result.myRank).toEqual(result.rows[0]);
  });
});
