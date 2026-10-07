// The rules page's scoring table and chip list, built from the season's
// ruleset as the server returns it (`api.fantasy_rules`).
//
// No point value is written here. The page used to state the scoring in one
// sentence of copy ("défenseur ou gardien : 6 pts"), which drifted from the
// ruleset (a goalkeeper's goal is 10) and left most of it out. Now the server's
// `positions[]` (goal and clean-sheet points per position) and `scoring[]`
// (every other category, with its position and threshold) are the only source,
// so the page cannot disagree with the game. `fantasy-rules-table.test.ts`
// feeds this the production payload and checks every cell against the table in
// `docs/backend/FANTASY_RULES_V1.md`.

import type { FantasyRulesDto } from "@/backend/fantasy/contracts";

export const RULE_POSITIONS = ["GK", "DEF", "MID", "FWD"] as const;
export type RulePosition = (typeof RULE_POSITIONS)[number];

/** The rulebook's row order. A category the page does not know is appended after these. */
export const SCORING_ROW_ORDER = [
  "appearance_short",
  "appearance_full",
  "goal",
  "official_assist",
  "clean_sheet",
  "saves",
  "penalty_save",
  "goals_conceded",
  "penalty_miss",
  "yellow_card",
  "direct_red_card",
  "second_yellow_dismissal",
  "own_goal",
] as const;
export type KnownScoringCategory = (typeof SCORING_ROW_ORDER)[number];

export interface ScoringRow {
  /** Stable key: category, plus the threshold when it has one. */
  key: string;
  category: string;
  /**
   * The number the row's label needs: the minutes of a full appearance (for
   * both appearance rows), the saves or goals conceded per point. `null` when
   * the row has none.
   */
  labelValue: number | null;
  /** Points per position; `null` where the ruleset has no rule for that position. */
  points: Record<RulePosition, number | null>;
}

interface ScoringEntry {
  category: string;
  points: number;
  threshold: number | null;
  position: RulePosition | null;
}

function isPosition(value: unknown): value is RulePosition {
  return typeof value === "string" && (RULE_POSITIONS as readonly string[]).includes(value);
}

/** `scoring[]` is typed `unknown[]` by the contract; anything malformed is skipped, never guessed. */
function parseEntry(raw: unknown): ScoringEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const entry = raw as Record<string, unknown>;
  if (typeof entry.category !== "string" || typeof entry.points !== "number") return null;
  const threshold = typeof entry.threshold === "number" ? entry.threshold : null;
  if (entry.position != null && !isPosition(entry.position)) return null;
  return {
    category: entry.category,
    points: entry.points,
    threshold,
    position: (entry.position as RulePosition | null | undefined) ?? null,
  };
}

const emptyPoints = (): Record<RulePosition, number | null> => ({
  GK: null,
  DEF: null,
  MID: null,
  FWD: null,
});

/**
 * One row per event, in the rulebook's order, each with the points for the
 * four positions. A rule without a position applies to all four.
 */
export function scoringRows(rules: Pick<FantasyRulesDto, "positions" | "scoring">): ScoringRow[] {
  const entries = rules.scoring.map(parseEntry).filter((e): e is ScoringEntry => e !== null);
  const fullMinutes =
    entries.find((entry) => entry.category === "appearance_full")?.threshold ?? null;

  const rows = new Map<string, ScoringRow>();
  const rowFor = (category: string, threshold: number | null): ScoringRow => {
    // The appearance rows carry their own minimum (1 and 60) as thresholds;
    // they are one row each whatever it is.
    const keyed = category.startsWith("appearance_") ? null : threshold;
    const key = keyed === null ? category : `${category}:${keyed}`;
    let row = rows.get(key);
    if (!row) {
      row = {
        key,
        category,
        labelValue: category.startsWith("appearance_") ? fullMinutes : keyed,
        points: emptyPoints(),
      };
      rows.set(key, row);
    }
    return row;
  };

  // Goals and clean sheets are per-position columns of the ruleset.
  if (rules.positions.length > 0) {
    const goal = rowFor("goal", null);
    const cleanSheet = rowFor("clean_sheet", null);
    for (const position of rules.positions) {
      goal.points[position.code] = position.goalPoints;
      cleanSheet.points[position.code] = position.cleanSheetPoints;
    }
  }
  for (const entry of entries) {
    const row = rowFor(entry.category, entry.threshold);
    for (const position of entry.position ? [entry.position] : RULE_POSITIONS) {
      row.points[position] = entry.points;
    }
  }

  const rank = (category: string) => {
    const index = (SCORING_ROW_ORDER as readonly string[]).indexOf(category);
    return index === -1 ? SCORING_ROW_ORDER.length : index;
  };
  return [...rows.values()].sort(
    (a, b) => rank(a.category) - rank(b.category) || a.key.localeCompare(b.key),
  );
}

export function isKnownCategory(category: string): category is KnownScoringCategory {
  return (SCORING_ROW_ORDER as readonly string[]).includes(category);
}

/** A row with no points for any position is not worth a line of the table. */
export function scoresAnything(row: ScoringRow): boolean {
  return RULE_POSITIONS.some((position) => (row.points[position] ?? 0) !== 0);
}

/* ------------------------------------------------------------------ */
/* Chips                                                               */
/* ------------------------------------------------------------------ */

export type RuleChipType = FantasyRulesDto["chips"][number]["chipType"];

/** PRODUCT.md's order: Joker, Triple Capitaine, Free Hit, Bench Boost. */
export const CHIP_ORDER: readonly RuleChipType[] = [
  "wildcard",
  "triple_captain",
  "free_hit",
  "bench_boost",
];

export interface ChipRule {
  type: RuleChipType;
  /** One window per allocation: each is one use, from `from` to `to` (null: to the season's end). */
  windows: Array<{ from: number; to: number | null }>;
  cancellable: boolean;
}

export function chipRules(rules: Pick<FantasyRulesDto, "chips">): ChipRule[] {
  const byType = new Map<RuleChipType, ChipRule>();
  for (const chip of rules.chips) {
    const rule = byType.get(chip.chipType) ?? {
      type: chip.chipType,
      windows: [],
      cancellable: false,
    };
    rule.windows.push({ from: chip.startsAtGameweek, to: chip.endsAtGameweek });
    rule.cancellable = rule.cancellable || chip.cancellable;
    byType.set(chip.chipType, rule);
  }
  for (const rule of byType.values()) rule.windows.sort((a, b) => a.from - b.from);
  return CHIP_ORDER.filter((type) => byType.has(type)).map((type) => byType.get(type)!);
}
