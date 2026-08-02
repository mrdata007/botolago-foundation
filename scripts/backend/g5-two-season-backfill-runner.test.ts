import { describe, expect, it } from "bun:test";
import {
  catalogJobsForSeason,
  validateCatalogJobResponse,
  validateContentResponse,
  validateFixtureResponse,
  validateRatingsResponse,
} from "./g5-two-season-backfill-runner";

const counts = (overrides: Record<string, number> = {}) => ({
  fetched: 16,
  validated: 16,
  inserted: 16,
  updated: 0,
  skipped: 0,
  rejected: 0,
  retries: 0,
  ...overrides,
});

describe("G5 two-season backfill response validation", () => {
  it("skips existing catalog dependencies and scopes the new season to three jobs", () => {
    expect(catalogJobsForSeason(26_027)).toEqual([]);
    expect(catalogJobsForSeason(24_319)).toEqual(["seasons", "rounds", "teams"]);
  });

  it("accepts exact catalog and fixture reconciliation", () => {
    expect(
      validateCatalogJobResponse(
        {
          provider: "sportsmonks",
          jobs: {
            rounds: counts({ fetched: 30, validated: 30, inserted: 0, updated: 30 }),
          },
        },
        "rounds",
        30,
      ).validated,
    ).toBe(30);
    expect(
      validateFixtureResponse(
        {
          provider: "sportsmonks",
          window: { from: "2025-09-12", to: "2025-12-20" },
          jobs: { fixtures: counts({ fetched: 42, validated: 42, inserted: 42 }) },
        },
        { from: "2025-09-12", to: "2025-12-20", inclusiveDays: 100 },
      ).fetched,
    ).toBe(42);
  });

  it("accepts source squad rejections only when every fetched row reconciles", () => {
    const result = validateContentResponse(
      {
        provider: "sportsmonks",
        seasonId: 26_027,
        jobs: {
          squads: {
            ...counts({
              fetched: 602,
              validated: 597,
              inserted: 0,
              updated: 597,
              skipped: 3,
              rejected: 2,
            }),
            uniquePlayers: 561,
            playersInserted: 0,
            playersUpdated: 561,
            playersSkipped: 36,
          },
          standings: counts({ inserted: 0, updated: 16 }),
        },
      },
      26_027,
      16,
    );
    expect(result.squads.rejected).toBe(2);
    expect(result.squads.uniquePlayers).toBe(561);
  });

  it("rejects partial or cross-window results", () => {
    expect(() =>
      validateFixtureResponse(
        {
          provider: "sportsmonks",
          window: { from: "2025-09-13", to: "2025-12-20" },
          jobs: { fixtures: counts() },
        },
        { from: "2025-09-12", to: "2025-12-20", inclusiveDays: 100 },
      ),
    ).toThrow("fixture_scope_mismatch");
    expect(() =>
      validateCatalogJobResponse(
        {
          provider: "sportsmonks",
          jobs: {
            rounds: counts({ fetched: 30, validated: 29, inserted: 29, rejected: 1 }),
          },
        },
        "rounds",
        30,
      ),
    ).toThrow("catalog_rounds_count_mismatch");
  });

  it("requires ratings for at least one persisted candidate", () => {
    expect(
      validateRatingsResponse(
        {
          provider: "sportsmonks",
          seasonId: 24_319,
          algorithmVersion: "botolago-preseason-rating-v1",
          candidates: 420,
          ratingRange: { minimum: 4.5, maximum: 9.8 },
          counters: counts({ fetched: 430, validated: 420, inserted: 420, skipped: 10 }),
        },
        24_319,
      ).candidates,
    ).toBe(420);
  });
});
