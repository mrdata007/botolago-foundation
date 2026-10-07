import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { fantasyRulesSchema } from "@/backend/fantasy/contracts";
import { buildChipList, buildScoringTable } from "@/lib/fantasy-rules-table";
import { fantasyService } from "./fantasy-runtime";

/**
 * BG-0155 (5) — mock mode's ruleset is the published v1 ruleset, row for
 * row, in the shape `api.fantasy_rules` returns it. Before this the mock
 * sent `positions`, `scoring` and `chips` as empty lists, so a local run
 * could never show the scoring table production shows.
 *
 * The expected rows are read from the migration that publishes v1, not
 * copied by hand, so the mock cannot drift from it unnoticed.
 */

const ROOT = join(import.meta.dir, "..", "..");
const sql = readFileSync(
  join(ROOT, "supabase/migrations/20260720163222_fantasy_ruleset_v1.sql"),
  "utf8",
);

/** The block of `sql` from `start` to the first `end` after it. */
function block(start: string, end: string): string {
  const from = sql.indexOf(start);
  expect(from).toBeGreaterThan(-1);
  return sql.slice(from, sql.indexOf(end, from));
}

const positionCases = [
  ...block("insert into app.fantasy_position_rules", "from app.fantasy_positions").matchAll(
    /case position\.code when 'GK' then (-?\d+) when 'DEF' then (-?\d+) when 'MID' then (-?\d+) else (-?\d+) end/g,
  ),
].map((match) => match.slice(1, 5).map(Number));

const migrationPositions = ["GK", "DEF", "MID", "FWD"].map((code, index) => ({
  code,
  squadQuota: positionCases[0][index],
  startingMinimum: positionCases[1][index],
  startingMaximum: positionCases[2][index],
  goalPoints: positionCases[3][index],
  cleanSheetPoints: positionCases[4][index],
}));

const migrationScoring = [
  ...block("insert into app.fantasy_scoring_rules", "as rule(").matchAll(
    /\('([a-z_]+)', (-?\d+), (null|\d+)::numeric, (?:null|'([A-Z]+)')(?:::text)?\)/g,
  ),
].map((match) => ({
  category: match[1],
  points: Number(match[2]),
  threshold: match[3] === "null" ? null : Number(match[3]),
  position: match[4] ?? null,
}));

const migrationChips = [
  ...block("insert into app.fantasy_chip_rules", "insert into app.fantasy_price_rules").matchAll(
    /'([a-z0-9_]+)', '(wildcard|free_hit|bench_boost|triple_captain)', (\d+), (null|\d+), (true|false),/g,
  ),
].map((match) => ({
  allocationCode: match[1],
  chipType: match[2],
  startsAtGameweek: Number(match[3]),
  endsAtGameweek: match[4] === "null" ? null : Number(match[4]),
  cancellable: match[5] === "true",
}));

/** `order by a, b, c` as Postgres sorts it: nulls last. */
const byKeys =
  <T>(...keys: ((row: T) => string | number | null)[]) =>
  (a: T, b: T) => {
    for (const key of keys) {
      const x = key(a);
      const y = key(b);
      if (x === y) continue;
      if (x === null) return 1;
      if (y === null) return -1;
      return x < y ? -1 : 1;
    }
    return 0;
  };

describe("fantasyService.getRules in mock mode", () => {
  test("the migration was read: 4 positions, 12 scoring rows, 5 chip allocations", () => {
    expect(positionCases).toHaveLength(5);
    expect(migrationScoring).toHaveLength(12);
    expect(migrationChips).toHaveLength(5);
  });

  test("passes the same contract the server's answer is parsed with", async () => {
    const rules = await fantasyService.getRules();
    expect(fantasyRulesSchema.safeParse(rules).success).toBe(true);
  });

  test("returns the v1 positions in display order", async () => {
    const rules = await fantasyService.getRules();
    expect(rules.positions).toEqual(migrationPositions as typeof rules.positions);
  });

  test("returns the v1 scoring rows, ordered by category, position, threshold", async () => {
    const rules = await fantasyService.getRules();
    const expected = [...migrationScoring].sort(
      byKeys<(typeof migrationScoring)[number]>(
        (row) => row.category,
        (row) => row.position,
        (row) => row.threshold,
      ),
    );
    expect(rules.scoring).toEqual(expected);
  });

  test("returns the v1 chip allocations, ordered by first round then allocation", async () => {
    const rules = await fantasyService.getRules();
    const expected = [...migrationChips].sort(
      byKeys<(typeof migrationChips)[number]>(
        (row) => row.startsAtGameweek,
        (row) => row.allocationCode,
      ),
    );
    expect(rules.chips).toEqual(expected as typeof rules.chips);
  });

  test("keeps the transfer numbers the rules page fills its sentence with", async () => {
    const rules = await fantasyService.getRules();
    expect([
      rules.initialFreeTransfers,
      rules.maxFreeTransferRollover,
      rules.transferHitCost,
    ]).toEqual([1, 2, 4]);
  });

  test("so a local run draws the full table and the four chips", async () => {
    const rules = await fantasyService.getRules();
    const table = buildScoringTable(rules);
    expect(table?.rows).toHaveLength(13);
    expect(table?.rows.find((row) => row.kind === "goal")?.cells).toEqual([10, 6, 5, 4]);
    expect(buildChipList(rules.chips).map((chip) => chip.chip)).toEqual([
      "wildcard",
      "triple_captain",
      "free_hit",
      "bench_boost",
    ]);
  });
});
