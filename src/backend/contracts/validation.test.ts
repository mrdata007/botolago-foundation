import { describe, expect, it } from "bun:test";
import { postgresUuidSchema } from "./validation";
import { teamSummarySchema } from "@/backend/football/contracts";

const stagingTeamId = "9c6ccc72-8726-05ca-a49c-e646cbeaee0f";

describe("PostgreSQL UUID DTO validation", () => {
  it("accepts canonical PostgreSQL UUID text without requiring RFC version bits", () => {
    expect(postgresUuidSchema.parse(stagingTeamId)).toBe(stagingTeamId);
  });

  it("rejects malformed identifiers", () => {
    expect(postgresUuidSchema.safeParse("fantasy-load-club-18").success).toBe(false);
  });

  it("keeps the Football team catalog compatible with canonical database IDs", () => {
    expect(
      teamSummarySchema.parse({
        id: stagingTeamId,
        slug: "fantasy-load-club-18",
        name: "Fantasy Load Club 18",
        shortName: "LC18",
        code: "L18",
        city: null,
        countryCode: null,
        crestUrl: null,
        crestPath: null,
        primaryColor: null,
        secondaryColor: null,
        active: true,
      }).id,
    ).toBe(stagingTeamId);
  });
});
