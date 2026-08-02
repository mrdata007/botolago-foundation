import { describe, expect, it } from "bun:test";

import {
  validateHistoricalPerformanceBatch,
  validateHistoricalRatingDerivation,
} from "./g7-historical-performance-backfill-runner";

describe("G7 historical performance production response validation", () => {
  it("pins a manual historical-only workflow with failure evidence preservation", async () => {
    const ticket = (await Bun.file(
      "docs/production/g7-historical-performance-backfill-trigger.json",
    ).json()) as Record<string, unknown>;
    expect(ticket).toMatchObject({
      requestedSeasonIds: [26_027, 24_319],
      expectedFixturesPerSeason: 240,
      batchSize: 5,
      algorithmVersion: "botolago-preseason-rating-v2-fixture-performance",
      historicalOnly: true,
      currentSeasonActivated: false,
      confirmation: "RUN_G7_TWO_SEASON_HISTORICAL_PERFORMANCE_BACKFILL",
    });
    const workflow = await Bun.file(
      ".github/workflows/g7-production-historical-performance-backfill.yml",
    ).text();
    expect(workflow).not.toContain("push:");
    expect(workflow).toContain("GITHUB_WORKFLOW_RERUN_FORBIDDEN");
    expect(workflow).toContain("if: always()");
    expect(workflow).toContain(
      'export FOOTBALL_INGESTION_TRIGGER_SECRET="${G7_BACKFILL_TRIGGER:-}"',
    );
    expect(workflow.indexOf("Upload sanitized historical backfill evidence")).toBeLessThan(
      workflow.indexOf("Remove protected runtime files"),
    );
  });

  it("accepts a bounded, exact fixture batch", () => {
    expect(
      validateHistoricalPerformanceBatch(
        {
          provider: "sportsmonks",
          seasonId: 26_027,
          action: "ingest_batch",
          expectedFixtureCount: 240,
          fixturesProcessed: 5,
          performanceRows: 196,
          excludedIncompleteRows: 2,
          nextCursor: "19490001",
          hasMore: true,
          counters: { validated: 196, rejected: 0 },
        },
        26_027,
        "19480000",
      ),
    ).toEqual({
      fixturesProcessed: 5,
      performanceRows: 196,
      excludedIncompleteRows: 2,
      nextCursor: "19490001",
      hasMore: true,
    });
  });

  it("rejects cursor regressions and partial provider rows", () => {
    expect(() =>
      validateHistoricalPerformanceBatch(
        {
          provider: "sportsmonks",
          seasonId: 26_027,
          action: "ingest_batch",
          expectedFixtureCount: 240,
          fixturesProcessed: 5,
          performanceRows: 100,
          excludedIncompleteRows: 0,
          nextCursor: "19470000",
          hasMore: true,
          counters: { validated: 100, rejected: 0 },
        },
        26_027,
        "19480000",
      ),
    ).toThrow("historical_performance_batch_mismatch");
  });

  it("requires a non-neutral v2 rating range after all 240 fixtures", () => {
    expect(
      validateHistoricalRatingDerivation(
        {
          provider: "sportsmonks",
          seasonId: 24_319,
          action: "derive_ratings",
          historicalOnly: true,
          algorithmVersion: "botolago-preseason-rating-v2-fixture-performance",
          expectedFixtureCount: 240,
          performanceRows: 9_240,
          candidates: 612,
          sourceVersion: `sportsmonks-season-fixtures:${"a".repeat(64)}`,
          ratingRange: { minimum: 4.2, maximum: 9.8 },
          counters: { validated: 612, rejected: 0 },
        },
        24_319,
        9_240,
      ),
    ).toMatchObject({
      candidates: 612,
      ratingRange: { minimum: 4.2, maximum: 9.8 },
    });
  });

  it("rejects the old all-neutral fallback as derivation evidence", () => {
    expect(() =>
      validateHistoricalRatingDerivation(
        {
          provider: "sportsmonks",
          seasonId: 24_319,
          action: "derive_ratings",
          historicalOnly: true,
          algorithmVersion: "botolago-preseason-rating-v2-fixture-performance",
          expectedFixtureCount: 240,
          performanceRows: 9_240,
          candidates: 612,
          sourceVersion: `sportsmonks-season-fixtures:${"a".repeat(64)}`,
          ratingRange: { minimum: 6, maximum: 6 },
          counters: { validated: 612, rejected: 0 },
        },
        24_319,
        9_240,
      ),
    ).toThrow("historical_rating_derivation_mismatch");
  });
});
