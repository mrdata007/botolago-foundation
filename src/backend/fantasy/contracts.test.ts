import { describe, expect, it } from "bun:test";
import {
  fantasyFixtureDifficultySchema,
  fantasyGlobalRankingPageSchema,
  fantasyPlayerSchema,
  fantasyPointsSchema,
  fantasyTeamSchema,
  fantasyTransferPreviewSchema,
  postgresUuidSchema,
} from "./contracts";

const postgresUuid = "fe53ed14-c31f-8970-73d0-7c6d2c4efc1e";
const footballTeamUuid = "9c6ccc72-8726-05ca-a49c-e646cbeaee0f";

describe("Fantasy PostgreSQL UUID contracts", () => {
  it("accepts canonical PostgreSQL UUID text independently of RFC version bits", () => {
    expect(postgresUuidSchema.parse(postgresUuid)).toBe(postgresUuid);
    expect(postgresUuidSchema.parse(footballTeamUuid)).toBe(footballTeamUuid);
  });

  it("still rejects malformed identifiers", () => {
    expect(postgresUuidSchema.safeParse("fantasy-load-player-1").success).toBe(false);
    expect(postgresUuidSchema.safeParse("fe53ed14-c31f-8970-73d0").success).toBe(false);
  });

  it("accepts the canonical staging player DTO shape", () => {
    expect(
      fantasyPlayerSchema.parse({
        id: postgresUuid,
        footballPlayerId: "11806e70-d9f1-0480-22d5-2075f73da81e",
        footballTeamId: footballTeamUuid,
        name: "Load Player 18",
        fullName: "Fantasy Load Player 18",
        position: "GK",
        price: 6,
        status: "available",
        teamName: "Fantasy Load Club 18",
        teamShortName: "LC18",
        photoAssetId: null,
        crestAssetId: null,
        selectedByCount: 0,
      }).id,
    ).toBe(postgresUuid);
  });
});

describe("Fantasy pre-activation contracts", () => {
  const baseTeam = {
    id: "fe53ed14-c31f-8970-73d0-7c6d2c4efc1e",
    seasonId: "11806e70-d9f1-0480-22d5-2075f73da81e",
    currentGameweekId: null,
    name: "Atlas Eleven",
    bank: 10,
    teamValue: 90,
    freeTransfers: 1,
    version: 2,
    status: "active",
    createdAt: "2026-08-03T12:00:00Z",
    updatedAt: "2026-08-03T12:00:00Z",
    squad: [],
    lineup: [],
  } as const;

  it("keeps legacy team DTOs compatible while defaulting chip state safely", () => {
    expect(fantasyTeamSchema.parse(baseTeam).chips).toEqual({
      active: null,
      activeCancellable: false,
      used: [],
    });
  });

  it("parses authoritative chip lifecycle state from the team DTO", () => {
    expect(
      fantasyTeamSchema.parse({
        ...baseTeam,
        chips: { active: "bench_boost", activeCancellable: false, used: ["wildcard"] },
      }).chips,
    ).toEqual({ active: "bench_boost", activeCancellable: false, used: ["wildcard"] });
  });

  it("rejects fixture difficulty ratings outside the closed 1-to-5 scale", () => {
    const dto = {
      fixtureId: postgresUuid,
      gameweekId: "11806e70-d9f1-0480-22d5-2075f73da81e",
      gameweek: 1,
      clubId: footballTeamUuid,
      opponentClubId: "0a32b1b0-2ac8-4ba1-b7e0-d16b87d87f6d",
      kickoffAt: "2026-08-20T18:00:00Z",
      isHome: true,
      difficulty: 3,
      confidence: "high",
      algorithmVersion: "table-strength-v1.0",
    } as const;
    expect(fantasyFixtureDifficultySchema.parse(dto).difficulty).toBe(3);
    expect(fantasyFixtureDifficultySchema.safeParse({ ...dto, difficulty: 6 }).success).toBe(false);
  });

  it("accepts honest pre-match point defaults before a result is materialized", () => {
    const dto = fantasyPointsSchema.parse({
      teamId: postgresUuid,
      gameweekId: "11806e70-d9f1-0480-22d5-2075f73da81e",
      gameweekStatus: "open",
      pointsState: "provisional",
      result: null,
      players: [
        {
          fantasyPlayerId: "0a32b1b0-2ac8-4ba1-b7e0-d16b87d87f6d",
          slot: "starter",
          slotOrder: 1,
          captain: true,
          viceCaptain: false,
          multiplier: 2,
          provisionalPoints: 0,
          finalPoints: null,
          didPlay: false,
          minutesPlayed: 0,
        },
      ],
    });

    expect(dto.result).toBeNull();
    expect(dto.players[0]).toMatchObject({
      provisionalPoints: 0,
      finalPoints: null,
      didPlay: false,
      minutesPlayed: 0,
    });
  });

  it("validates bounded public global ranking pages", () => {
    const page = {
      items: [
        {
          teamId: postgresUuid,
          teamName: "Atlas Eleven",
          rank: 1,
          previousRank: null,
          totalPoints: 100,
          gameweekPoints: 50,
        },
      ],
      total: 1,
      podium: [],
      myRank: null,
    };
    expect(fantasyGlobalRankingPageSchema.parse(page).items[0].rank).toBe(1);
    expect(
      fantasyGlobalRankingPageSchema.safeParse({
        ...page,
        items: [{ ...page.items[0], rank: 0 }],
      }).success,
    ).toBe(false);
  });

  it("coerces numeric transfer preview values without accepting a zero transfer", () => {
    const preview = {
      transferCount: 1,
      bankBefore: "5.0",
      bankAfter: "4.5",
      freeTransfersBefore: 1,
      freeTransfersUsed: 1,
      pointHit: 0,
      resultingVersion: "3",
      deadlineAt: "2026-08-20T16:30:00Z",
      chipType: null,
    };
    expect(fantasyTransferPreviewSchema.parse(preview).resultingVersion).toBe(3);
    expect(fantasyTransferPreviewSchema.safeParse({ ...preview, transferCount: 0 }).success).toBe(
      false,
    );
  });
});
