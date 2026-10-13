import { describe, expect, it } from "bun:test";
import type { FantasyGlobalRankingPageDto, FantasyPointsDto } from "@/backend/fantasy/contracts";
import { mapFantasyGlobalRankingsDto, mapFantasyPointsDto } from "./fantasy-runtime";
import { buildAuthoritativePointsViewModel } from "./points-service";

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
  autoSubs: [
    {
      playerOutId: "00000000-0000-4000-8000-000000000004",
      playerInId: "00000000-0000-4000-8000-000000000005",
      reason: "outfield_did_not_play",
    },
  ],
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
      events: [
        { category: "appearance", points: 2, count: 1 },
        { category: "yellow_card", points: -1, count: 1 },
      ],
    },
    {
      fantasyPlayerId: "00000000-0000-4000-8000-000000000004",
      slot: "starter",
      slotOrder: 2,
      captain: false,
      viceCaptain: false,
      multiplier: 0,
      provisionalPoints: 0,
      finalPoints: 0,
      didPlay: false,
      minutesPlayed: 0,
      events: [],
    },
    {
      fantasyPlayerId: "00000000-0000-4000-8000-000000000005",
      slot: "bench",
      slotOrder: 1,
      captain: false,
      viceCaptain: false,
      multiplier: 1,
      provisionalPoints: 3,
      finalPoints: 3,
      didPlay: true,
      minutesPlayed: 45,
      events: [{ category: "appearance", points: 1, count: 1 }],
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
    expect(result?.breakdown[0].events).toEqual([
      { kind: "appearance", points: 2, count: 1 },
      { kind: "yellow", points: -1, count: 1 },
    ]);
    expect(result?.autoSubs).toEqual([
      {
        outId: dto.autoSubs[0].playerOutId,
        inId: dto.autoSubs[0].playerInId,
        reason: {
          fr: "fantasy.engine.sub.outfield",
          ar: "fantasy.engine.sub.outfield",
        },
      },
    ]);
    expect(result?.finalized).toBe(true);
  });

  it("uses authoritative auto-subs for the effective pitch XI", () => {
    const result = mapFantasyPointsDto(1, dto)!;
    const view = buildAuthoritativePointsViewModel(result);

    expect(view.effectiveStartingIds).toEqual([
      "00000000-0000-4000-8000-000000000003",
      dto.autoSubs[0].playerInId,
    ]);
    expect(view.autoSubs[0]).toMatchObject({
      outId: dto.autoSubs[0].playerOutId,
      inId: dto.autoSubs[0].playerInId,
    });
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
