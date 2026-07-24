import { describe, expect, it } from "bun:test";
import { fantasyPlayerSchema, postgresUuidSchema } from "./contracts";

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
