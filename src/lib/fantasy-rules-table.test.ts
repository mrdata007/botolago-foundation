import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  buildChipList,
  buildScoringTable,
  templateParts,
  type ScoringRowKind,
  type ScoringTable,
} from "./fantasy-rules-table";

/**
 * BG-0155 (5) — the rules page's scoring table and chips list, built from
 * what `api.fantasy_rules` returns. The v1 rows below are the published
 * ruleset (`supabase/migrations/20260720163222_fantasy_ruleset_v1.sql`) in
 * the RPC's own shape and order; the table they make is held to every row
 * of `docs/backend/FANTASY_RULES_V1.md` §Scoring.
 */

const ROOT = join(import.meta.dir, "..", "..");

const V1_POSITIONS = [
  {
    code: "GK",
    squadQuota: 2,
    startingMinimum: 1,
    startingMaximum: 1,
    goalPoints: 10,
    cleanSheetPoints: 4,
  },
  {
    code: "DEF",
    squadQuota: 5,
    startingMinimum: 3,
    startingMaximum: 5,
    goalPoints: 6,
    cleanSheetPoints: 4,
  },
  {
    code: "MID",
    squadQuota: 5,
    startingMinimum: 2,
    startingMaximum: 5,
    goalPoints: 5,
    cleanSheetPoints: 1,
  },
  {
    code: "FWD",
    squadQuota: 3,
    startingMinimum: 1,
    startingMaximum: 3,
    goalPoints: 4,
    cleanSheetPoints: 0,
  },
];

const V1_SCORING = [
  { category: "appearance_full", points: 2, threshold: 60, position: null },
  { category: "appearance_short", points: 1, threshold: 1, position: null },
  { category: "direct_red_card", points: -3, threshold: null, position: null },
  { category: "goals_conceded", points: -1, threshold: 2, position: "DEF" },
  { category: "goals_conceded", points: -1, threshold: 2, position: "GK" },
  { category: "official_assist", points: 3, threshold: null, position: null },
  { category: "own_goal", points: -2, threshold: null, position: null },
  { category: "penalty_miss", points: -2, threshold: null, position: null },
  { category: "penalty_save", points: 5, threshold: null, position: "GK" },
  { category: "saves", points: 1, threshold: 3, position: "GK" },
  { category: "second_yellow_dismissal", points: -3, threshold: null, position: null },
  { category: "yellow_card", points: -1, threshold: null, position: null },
];

const V1_CHIPS = [
  {
    allocationCode: "bench_boost",
    chipType: "bench_boost",
    startsAtGameweek: 1,
    endsAtGameweek: null,
    cancellable: false,
  },
  {
    allocationCode: "free_hit",
    chipType: "free_hit",
    startsAtGameweek: 1,
    endsAtGameweek: null,
    cancellable: false,
  },
  {
    allocationCode: "triple_captain",
    chipType: "triple_captain",
    startsAtGameweek: 1,
    endsAtGameweek: null,
    cancellable: false,
  },
  {
    allocationCode: "wildcard_1",
    chipType: "wildcard",
    startsAtGameweek: 1,
    endsAtGameweek: 15,
    cancellable: false,
  },
  {
    allocationCode: "wildcard_2",
    chipType: "wildcard",
    startsAtGameweek: 16,
    endsAtGameweek: null,
    cancellable: false,
  },
];

const v1Table = () => buildScoringTable({ positions: V1_POSITIONS, scoring: V1_SCORING });

/** A row as `[kind, n, ...cells]` so a whole table reads as one literal. */
const flat = (table: ScoringTable | null) =>
  table?.rows.map((row) => [row.kind, row.n, ...row.cells]) ?? null;

const row = (table: ScoringTable | null, kind: ScoringRowKind) =>
  table?.rows.find((candidate) => candidate.kind === kind);

describe("buildScoringTable — the v1 ruleset", () => {
  test("has one column per position, in the server's display order", () => {
    expect(v1Table()?.columns).toEqual(["GK", "DEF", "MID", "FWD"]);
  });

  test("reads every figure the server sent, and nothing it did not", () => {
    expect(flat(v1Table())).toEqual([
      ["appearance_short", 60, 1, 1, 1, 1],
      ["appearance_full", 60, 2, 2, 2, 2],
      ["goal", null, 10, 6, 5, 4],
      ["official_assist", null, 3, 3, 3, 3],
      ["clean_sheet", null, 4, 4, 1, 0],
      ["saves", 3, 1, null, null, null],
      ["penalty_save", null, 5, null, null, null],
      ["goals_conceded", 2, -1, -1, null, null],
      ["penalty_miss", null, -2, -2, -2, -2],
      ["yellow_card", null, -1, -1, -1, -1],
      ["direct_red_card", null, -3, -3, -3, -3],
      ["second_yellow_dismissal", null, -3, -3, -3, -3],
      ["own_goal", null, -2, -2, -2, -2],
    ]);
  });

  test("a goal is GK 10, DEF 6, MID 5, FWD 4 — not the 6 the old copy gave a goalkeeper", () => {
    expect(row(v1Table(), "goal")?.cells).toEqual([10, 6, 5, 4]);
  });

  test("a forward's clean sheet is a real 0, which is not the same as 'does not apply'", () => {
    const cleanSheet = row(v1Table(), "clean_sheet")?.cells;
    expect(cleanSheet?.[3]).toBe(0);
    expect(cleanSheet?.[3]).not.toBeNull();
  });

  test("agrees with every row of FANTASY_RULES_V1.md §Scoring", () => {
    const doc = readFileSync(join(ROOT, "docs/backend/FANTASY_RULES_V1.md"), "utf8");
    const section = doc.slice(doc.indexOf("## Scoring"), doc.indexOf("Only official provider"));
    const docRows = section
      .split("\n")
      .filter((line) => line.startsWith("|") && !/Event|---/.test(line))
      .map((line) =>
        line
          .split("|")
          .slice(2, 6)
          .map((cell) => cell.trim())
          .map((cell) => (cell === "—" ? null : Number(cell))),
      );
    const table = v1Table();
    expect(docRows).toHaveLength(13);
    expect(table?.rows).toHaveLength(13);
    const differences: string[] = [];
    docRows.forEach((cells, index) => {
      cells.forEach((cell, column) => {
        const ours = table?.rows[index]?.cells[column];
        if (ours !== cell) {
          differences.push(
            `${table?.rows[index]?.kind}/${table?.columns[column]}: ${ours} vs ${cell}`,
          );
        }
      });
    });
    // The one place the document and the data differ: the document writes
    // MID/FWD goals conceded as 0, and the ruleset has no row for them at
    // all. The table says what the data says — the event does not apply.
    expect(differences).toEqual(["goals_conceded/MID: null vs 0", "goals_conceded/FWD: null vs 0"]);
  });
});

describe("buildScoringTable — defensive reading", () => {
  test("no positions, no scoring rows, or something that is not a list: no table", () => {
    expect(buildScoringTable({ positions: [], scoring: V1_SCORING })).toBeNull();
    expect(buildScoringTable({ positions: V1_POSITIONS, scoring: [] })).toBeNull();
    expect(buildScoringTable({ positions: null, scoring: V1_SCORING })).toBeNull();
    expect(buildScoringTable({ positions: V1_POSITIONS, scoring: "[]" })).toBeNull();
    expect(buildScoringTable({})).toBeNull();
  });

  test("only unreadable rows is the same as none", () => {
    expect(
      buildScoringTable({
        positions: [{ code: "XX", goalPoints: 1, cleanSheetPoints: 0 }],
        scoring: V1_SCORING,
      }),
    ).toBeNull();
    expect(
      buildScoringTable({
        positions: V1_POSITIONS,
        scoring: [{ category: "bonus", points: 3 }, null, "goal", { category: "own_goal" }],
      }),
    ).toBeNull();
  });

  test("drops a malformed row and keeps the rest", () => {
    const table = buildScoringTable({
      positions: [
        ...V1_POSITIONS,
        { code: "GK", goalPoints: 99, cleanSheetPoints: 99 },
        { code: "DEF" },
      ],
      scoring: [
        ...V1_SCORING,
        { category: "yellow_card", points: "-1", threshold: null, position: "MID" },
        { category: "own_goal", points: -2.5, threshold: null, position: "FWD" },
        { category: "own_goal", points: -99, threshold: null, position: "MID" },
        { category: "saves", points: 1, threshold: null, position: "DEF" },
        { category: "saves", points: 1, threshold: 0, position: "DEF" },
        { category: "goals_conceded", points: -1, threshold: -2, position: "MID" },
        { category: "penalty_miss", points: -2, threshold: null, position: "LW" },
        { category: "player_of_match", points: 3, threshold: null, position: null },
      ],
    });
    // The duplicate GK position does not replace the first; nothing else moved.
    expect(flat(table)).toEqual(flat(v1Table()));
  });

  test("accepts a threshold the database sent as a numeric string", () => {
    const table = buildScoringTable({
      positions: V1_POSITIONS,
      scoring: V1_SCORING.map((rule) =>
        rule.threshold === null ? rule : { ...rule, threshold: `${rule.threshold}.0000` },
      ),
    });
    expect(flat(table)).toEqual(flat(v1Table()));
  });

  test("a row naming a position wins over the every-position row in that column", () => {
    const table = buildScoringTable({
      positions: V1_POSITIONS,
      scoring: [
        { category: "official_assist", points: 3, threshold: null, position: null },
        { category: "official_assist", points: 4, threshold: null, position: "FWD" },
      ],
    });
    expect(row(table, "official_assist")?.cells).toEqual([3, 3, 3, 4]);
  });

  test("an event scored at two thresholds is two rows, smallest first", () => {
    const table = buildScoringTable({
      positions: V1_POSITIONS,
      scoring: [
        { category: "saves", points: 2, threshold: 6, position: "GK" },
        { category: "saves", points: 1, threshold: 3, position: "GK" },
      ],
    });
    expect(table?.rows.filter((candidate) => candidate.kind === "saves").map((r) => r.n)).toEqual([
      3, 6,
    ]);
  });

  test("columns follow the order the server sends", () => {
    const table = buildScoringTable({
      positions: [...V1_POSITIONS].reverse(),
      scoring: V1_SCORING,
    });
    expect(table?.columns).toEqual(["FWD", "MID", "DEF", "GK"]);
    expect(row(table, "goal")?.cells).toEqual([4, 5, 6, 10]);
    expect(row(table, "saves")?.cells).toEqual([null, null, null, 1]);
  });

  test("without a full-appearance row, the short appearance carries no minutes", () => {
    const table = buildScoringTable({
      positions: V1_POSITIONS,
      scoring: V1_SCORING.filter((rule) => rule.category !== "appearance_full"),
    });
    expect(row(table, "appearance_short")?.n).toBeNull();
    expect(row(table, "appearance_full")).toBeUndefined();
  });

  test("a position-only rule for a position the table has no column for is left out", () => {
    const table = buildScoringTable({
      positions: V1_POSITIONS.filter((position) => position.code !== "GK"),
      scoring: V1_SCORING,
    });
    expect(row(table, "saves")).toBeUndefined();
    expect(row(table, "penalty_save")).toBeUndefined();
    expect(row(table, "goals_conceded")?.cells).toEqual([-1, null, null]);
  });
});

describe("buildChipList", () => {
  test("lists the v1 chips in the page's order, each with the rounds it can be played in", () => {
    expect(buildChipList(V1_CHIPS)).toEqual([
      {
        chip: "wildcard",
        windows: [
          { from: 1, to: 15 },
          { from: 16, to: null },
        ],
      },
      { chip: "triple_captain", windows: [{ from: 1, to: null }] },
      { chip: "free_hit", windows: [{ from: 1, to: null }] },
      { chip: "bench_boost", windows: [{ from: 1, to: null }] },
    ]);
  });

  test("lists a chip's allocations earliest first, whatever order they arrive in", () => {
    expect(buildChipList([...V1_CHIPS].reverse())[0]).toEqual({
      chip: "wildcard",
      windows: [
        { from: 1, to: 15 },
        { from: 16, to: null },
      ],
    });
  });

  test("drops what it cannot read and lists only the chips the ruleset allocates", () => {
    expect(
      buildChipList([
        { chipType: "bench_boost", startsAtGameweek: 20, endsAtGameweek: 10 },
        { chipType: "mystery", startsAtGameweek: 1, endsAtGameweek: null },
        { chipType: "free_hit", startsAtGameweek: 0, endsAtGameweek: null },
        { chipType: "triple_captain", startsAtGameweek: 5, endsAtGameweek: 5 },
        null,
      ]),
    ).toEqual([{ chip: "triple_captain", windows: [{ from: 5, to: 5 }] }]);
    expect(buildChipList(null)).toEqual([]);
    expect(buildChipList([])).toEqual([]);
  });
});

describe("templateParts", () => {
  test("splits a line around its slots, in order", () => {
    expect(templateParts("{free} transfert, jusqu'à {max}.")).toEqual([
      { kind: "slot", name: "free" },
      { kind: "text", text: " transfert, jusqu'à " },
      { kind: "slot", name: "max" },
      { kind: "text", text: "." },
    ]);
    expect(templateParts("J{from}–J{to}")).toEqual([
      { kind: "text", text: "J" },
      { kind: "slot", name: "from" },
      { kind: "text", text: "–J" },
      { kind: "slot", name: "to" },
    ]);
    expect(templateParts("But")).toEqual([{ kind: "text", text: "But" }]);
  });
});
