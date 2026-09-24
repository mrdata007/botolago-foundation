import { describe, expect, it } from "bun:test";

import {
  adminPrizeWinnerSchema,
  PRIZE_ADMIN_ERROR_CODES,
  PrizeAdminError,
  prizeAdminErrorCode,
  publicPrizeSchema,
  publicPrizeWinnerSchema,
} from "./contracts";

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const publicWinner = {
  id: uuid(1),
  tier: "gameweek",
  seasonName: "2026/27",
  blockNumber: null,
  firstGameweekNumber: 7,
  lastGameweekNumber: 7,
  teamName: "Rif Rovers",
  maskedUsername: "h***7",
  points: 88,
  tieBreak: "outright",
  prizeName: { fr: "Recharge", ar: "رصيد" },
  awardedAt: "2026-11-01T12:00:00Z",
};

describe("public prize contracts", () => {
  it("drops any private field the database might ever start returning", () => {
    const parsed = publicPrizeWinnerSchema.parse({
      ...publicWinner,
      email: "winner@example.test",
      userId: uuid(9),
      displayName: "Real Name",
      verificationNotes: "ID checked",
    });
    expect(Object.keys(parsed).sort()).toEqual(Object.keys(publicWinner).sort());
    expect(JSON.stringify(parsed)).not.toContain("example.test");
    expect(JSON.stringify(parsed)).not.toContain("Real Name");
  });

  it("never lists a mini-league winner on the public wall", () => {
    expect(() => publicPrizeWinnerSchema.parse({ ...publicWinner, tier: "mini_league" })).toThrow();
  });

  it("accepts a mini-league prize without a value, and no negative value", () => {
    const prize = {
      id: uuid(2),
      tier: "mini_league",
      name: { fr: "Pack", ar: "حزمة" },
      description: { fr: "", ar: "" },
      estimatedValueMad: null,
      sponsorName: null,
      sponsorLogoUrl: null,
      imageUrl: null,
    };
    expect(publicPrizeSchema.parse(prize).estimatedValueMad).toBeNull();
    expect(() => publicPrizeSchema.parse({ ...prize, estimatedValueMad: -1 })).toThrow();
  });
});

describe("admin prize contracts", () => {
  it("keeps the verification fields the public shape leaves out", () => {
    const keys = Object.keys(adminPrizeWinnerSchema.shape);
    for (const key of ["email", "userId", "verificationNotes", "skipped", "overrideReason"])
      expect(keys).toContain(key);
    for (const key of ["email", "userId", "verificationNotes", "displayName"])
      expect(Object.keys(publicPrizeWinnerSchema.shape)).not.toContain(key);
  });
});

describe("prize refusals", () => {
  it("recognises a refusal the prize functions raise by name", () => {
    expect(prizeAdminErrorCode({ message: "prize_settings_conflict", code: "PT409" })).toBe(
      "prize_settings_conflict",
    );
    expect(prizeAdminErrorCode(new PrizeAdminError("prize_url_invalid"))).toBe("prize_url_invalid");
  });

  it("leaves access refusals and unknown text to the console's own mapping", () => {
    expect(prizeAdminErrorCode({ message: "staff_access_denied" })).toBeNull();
    expect(prizeAdminErrorCode({ message: "something prize_url_invalid happened" })).toBeNull();
    expect(prizeAdminErrorCode(null)).toBeNull();
  });

  it("lists every refusal the migration raises by name", async () => {
    const migration = await Bun.file(
      new URL("../../../supabase/migrations/20260924120000_fantasy_prizes.sql", import.meta.url),
    ).text();
    const raised = new Set(
      [...migration.matchAll(/message = '([a-z_]+)'/g)]
        .map((match) => match[1]!)
        .filter((code) => code.startsWith("prize_") || code === "fantasy_season_not_found"),
    );
    for (const code of raised) expect(PRIZE_ADMIN_ERROR_CODES as readonly string[]).toContain(code);
  });
});
