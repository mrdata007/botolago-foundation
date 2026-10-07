import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import { fantasyRulesSchema } from "@/backend/fantasy/contracts";
import {
  chipRules,
  RULE_POSITIONS,
  SCORING_ROW_ORDER,
  scoresAnything,
  scoringRows,
} from "./fantasy-rules-table";
import { PRODUCTION_RULES } from "./__fixtures__/fantasy-rules-production";

/**
 * The "Scoring" table of the approved rulebook, read from the document itself
 * so the test fails if either the page's mapping or the rulebook changes.
 * Each row: the event's label and four cells, "—" where the position has no
 * rule.
 */
function rulebookScoringTable(): Array<{ event: string; cells: string[] }> {
  const doc = readFileSync("docs/backend/FANTASY_RULES_V1.md", "utf8");
  const section = doc.split("## Scoring")[1].split("\n\n")[1];
  return section
    .split("\n")
    .filter((line) => line.startsWith("|"))
    .slice(2) // header and separator
    .map((line) => {
      const cells = line
        .split("|")
        .slice(1, -1)
        .map((cell) => cell.trim());
      return { event: cells[0], cells: cells.slice(1) };
    });
}

/** "0" and "—" both mean the position scores nothing for the event. */
const asPoints = (cell: string): number => (cell === "—" ? 0 : Number(cell));

describe("fantasy rules table — the page agrees with FANTASY_RULES_V1.md", () => {
  const rules = fantasyRulesSchema.parse(PRODUCTION_RULES);
  const rows = scoringRows(rules);
  const book = rulebookScoringTable();

  test("the rulebook table was read: 13 events × 4 positions", () => {
    expect(book).toHaveLength(13);
    for (const row of book) expect(row.cells).toHaveLength(4);
  });

  test("one row per rulebook event, in the rulebook's order", () => {
    expect(rows.map((row) => row.category)).toEqual([...SCORING_ROW_ORDER]);
    expect(rows).toHaveLength(book.length);
  });

  test("every cell equals the rulebook's", () => {
    rows.forEach((row, index) => {
      const expected = book[index].cells.map(asPoints);
      const actual = RULE_POSITIONS.map((position) => row.points[position] ?? 0);
      expect({ event: book[index].event, points: actual }).toEqual({
        event: book[index].event,
        points: expected,
      });
    });
  });

  test("the thresholds the labels quote come from the data", () => {
    const byCategory = new Map(rows.map((row) => [row.category, row]));
    // "Appearance under 60 official minutes" / "at least 60".
    expect(byCategory.get("appearance_short")?.labelValue).toBe(60);
    expect(byCategory.get("appearance_full")?.labelValue).toBe(60);
    // "Every three goalkeeper saves", "Every two goals conceded".
    expect(byCategory.get("saves")?.labelValue).toBe(3);
    expect(byCategory.get("goals_conceded")?.labelValue).toBe(2);
    expect(byCategory.get("goal")?.labelValue).toBeNull();
    expect(rows.every(scoresAnything)).toBe(true);
  });

  test("the goalkeeper's goal is 10 and the midfielder's clean sheet 1 (the copy said 6 and nothing)", () => {
    const goal = rows.find((row) => row.category === "goal")!;
    const cleanSheet = rows.find((row) => row.category === "clean_sheet")!;
    expect(goal.points).toEqual({ GK: 10, DEF: 6, MID: 5, FWD: 4 });
    expect(cleanSheet.points).toEqual({ GK: 4, DEF: 4, MID: 1, FWD: 0 });
  });

  test("chips: the four of them, two Jokers split at journée 15, none cancellable", () => {
    expect(chipRules(rules)).toEqual([
      {
        type: "wildcard",
        windows: [
          { from: 1, to: 15 },
          { from: 16, to: null },
        ],
        cancellable: false,
      },
      { type: "triple_captain", windows: [{ from: 1, to: null }], cancellable: false },
      { type: "free_hit", windows: [{ from: 1, to: null }], cancellable: false },
      { type: "bench_boost", windows: [{ from: 1, to: null }], cancellable: false },
    ]);
  });

  test("transfers and captaincy as the rulebook states them", () => {
    expect(rules.initialFreeTransfers).toBe(1);
    expect(rules.maxFreeTransferRollover).toBe(2);
    expect(rules.transferHitCost).toBe(4);
    expect(rules.captainMultiplier).toBe(2);
    expect(rules.tripleCaptainMultiplier).toBe(3);
    expect(rules.deadline.minutesBeforeFirstFixture).toBe(90);
  });
});

describe("fantasy rules table — defensive mapping", () => {
  test("a malformed or unknown entry is skipped or appended, never guessed", () => {
    const rows = scoringRows({
      positions: [],
      scoring: [
        { category: "yellow_card", points: -1, threshold: null, position: null },
        { category: "bonus", points: 3, threshold: null, position: null },
        { category: "own_goal", points: "x" },
        null,
        { category: "saves", points: 1, threshold: 3, position: "COACH" },
      ],
    });
    expect(rows.map((row) => row.category)).toEqual(["yellow_card", "bonus"]);
  });

  test("an empty ruleset (mock mode) gives no rows and no chips", () => {
    expect(scoringRows({ positions: [], scoring: [] })).toEqual([]);
    expect(chipRules({ chips: [] })).toEqual([]);
  });
});
