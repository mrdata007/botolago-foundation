import { describe, expect, it } from "bun:test";

import { parseRequestedSeasonIds } from "./g7-historical-performance-backfill-runner";

describe("G7 historical performance backfill preflight — season scope", () => {
  it("imports the runner's season-scope validator instead of re-implementing it", async () => {
    const source = await Bun.file(
      "scripts/backend/g7-historical-performance-backfill-preflight.ts",
    ).text();
    expect(source).toContain(
      'import { parseRequestedSeasonIds } from "./g7-historical-performance-backfill-runner"',
    );
    expect(source).toContain("g7-historical-performance-backfill-scope.json");
  });

  it("does not modify the shared two-season preflight module", async () => {
    const source = await Bun.file(
      "scripts/backend/g7-historical-performance-backfill-preflight.ts",
    ).text();
    expect(source).toContain("runTwoSeasonBackfillPreflight");
    expect(source).not.toContain("TWO_SEASON_BACKFILL_SCOPE = [");
  });

  it("accepts the ticket-pinned single-season scope", () => {
    expect(parseRequestedSeasonIds("26027")).toEqual([26_027]);
  });

  it("accepts a duplicate-free two-season scope in the given order", () => {
    expect(parseRequestedSeasonIds("26027,24319")).toEqual([26_027, 24_319]);
    expect(parseRequestedSeasonIds("24319,26027")).toEqual([24_319, 26_027]);
  });

  it("rejects an empty, duplicate, or out-of-scope season id list", () => {
    expect(() => parseRequestedSeasonIds(undefined)).toThrow("g7_season_ids_empty");
    expect(() => parseRequestedSeasonIds("")).toThrow("g7_season_ids_empty");
    expect(() => parseRequestedSeasonIds("26027,26027")).toThrow("g7_season_ids_duplicate");
    expect(parseRequestedSeasonIds("24319")).toEqual([24_319]); // 24319 alone is in scope
    expect(() => parseRequestedSeasonIds("28647")).toThrow("g7_season_ids_out_of_scope");
    expect(() => parseRequestedSeasonIds("26027,")).toThrow("g7_season_ids_malformed");
    expect(() => parseRequestedSeasonIds("not-a-number")).toThrow("g7_season_ids_malformed");
  });
});
