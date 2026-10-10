import { z } from "zod";

/**
 * BG-0157 (5) — the rules page's scoring table and chips list, read from
 * `api.fantasy_rules` and nothing else.
 *
 * The server returns three lists the page used to ignore:
 *
 * - `positions`: per position, in display order, with the goal and
 *   clean-sheet points (they live on the position, not in `scoring`);
 * - `scoring`: every other category, `{ category, points, threshold,
 *   position }`, where `position: null` means "every position";
 * - `chips`: one row per allocation, with the rounds it can be played in.
 *
 * The contract types `scoring` as `unknown[]` on purpose, so this module
 * parses every row on its own and drops the ones it cannot read rather than
 * failing the page. It computes no points: each figure in the model is a
 * figure the server sent, placed in a cell. A position an event has no row
 * for is `null` ("—" on screen), which is not the same thing as a row that
 * says 0.
 */

export const RULES_TABLE_POSITIONS = ["GK", "DEF", "MID", "FWD"] as const;
export type RulesTablePosition = (typeof RULES_TABLE_POSITIONS)[number];

/** The table's rows, top to bottom. `goal` and `clean_sheet` come from `positions`. */
export const SCORING_ROW_KINDS = [
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
export type ScoringRowKind = (typeof SCORING_ROW_KINDS)[number];

/** The categories `scoring` carries: every row kind but the two read from `positions`. */
type ScoringCategory = Exclude<ScoringRowKind, "goal" | "clean_sheet">;
const SCORING_CATEGORIES = SCORING_ROW_KINDS.filter(
  (kind): kind is ScoringCategory => kind !== "goal" && kind !== "clean_sheet",
);

/** Categories whose label carries their threshold ("every {n} saves"). */
const THRESHOLD_CATEGORIES: ReadonlySet<ScoringCategory> = new Set([
  "appearance_full",
  "saves",
  "goals_conceded",
]);

export interface ScoringTableRow {
  readonly kind: ScoringRowKind;
  /**
   * The number the row's label carries, or `null` when it carries none. For
   * `appearance_short` it is the full-appearance threshold ("under {n}
   * minutes"), `null` when the ruleset has no full-appearance row.
   */
  readonly n: number | null;
  /** Points per column, in `columns` order. `null`: the event does not apply. */
  readonly cells: readonly (number | null)[];
}

export interface ScoringTable {
  readonly columns: readonly RulesTablePosition[];
  readonly rows: readonly ScoringTableRow[];
  /**
   * The full-appearance threshold in minutes, `null` when the ruleset has
   * none. The scorer counts a clean sheet and goals conceded only from it
   * (`src/backend/fantasy/scoring.ts`), which the page says under the table.
   */
  readonly fullAppearanceMinutes: number | null;
}

const points = z.number().int().min(-50).max(50);

// `threshold` is `numeric(12,4)` in the database; jsonb carries it as a JSON
// number, but a numeric string is accepted too rather than losing the row.
const threshold = z
  .union([
    z.number(),
    z
      .string()
      .regex(/^\d+(\.\d+)?$/)
      .transform(Number),
  ])
  .pipe(z.number().finite().nonnegative());

const positionRow = z.object({
  code: z.enum(RULES_TABLE_POSITIONS),
  goalPoints: points,
  cleanSheetPoints: points,
});

const scoringRow = z.object({
  category: z.enum(SCORING_CATEGORIES as [ScoringCategory, ...ScoringCategory[]]),
  points,
  threshold: threshold.nullable().optional(),
  position: z.enum(RULES_TABLE_POSITIONS).nullable().optional(),
});
type ScoringRow = {
  readonly category: ScoringCategory;
  readonly points: number;
  readonly threshold: number | null;
  readonly position: RulesTablePosition | null;
};

function readRows<T>(rows: unknown, schema: z.ZodType<T>): T[] {
  if (!Array.isArray(rows)) return [];
  const read: T[] = [];
  for (const row of rows) {
    const parsed = schema.safeParse(row);
    if (parsed.success) read.push(parsed.data);
  }
  return read;
}

function readScoringRows(rows: unknown): ScoringRow[] {
  return readRows(rows, scoringRow)
    .map((row) => ({
      category: row.category,
      points: row.points,
      threshold: row.threshold ?? null,
      position: row.position ?? null,
    }))
    .filter(
      // "Every 0 saves" or "60 minutes or more" without its 60 cannot be
      // labelled truthfully: such a row is malformed, not a rule.
      (row) => !THRESHOLD_CATEGORIES.has(row.category) || (row.threshold ?? 0) > 0,
    );
}

/**
 * The scoring table, or `null` when the server sent no usable positions or
 * no usable scoring rows — the page then says the detailed scale is
 * unavailable instead of showing a partial or invented one.
 */
export function buildScoringTable(input: {
  readonly positions?: unknown;
  readonly scoring?: unknown;
}): ScoringTable | null {
  const positions: z.infer<typeof positionRow>[] = [];
  for (const row of readRows(input.positions, positionRow)) {
    if (!positions.some((known) => known.code === row.code)) positions.push(row);
  }
  const scoring = readScoringRows(input.scoring);
  if (positions.length === 0 || scoring.length === 0) return null;

  const columns = positions.map((position) => position.code);
  const fullAppearance = scoring
    .filter((row) => row.category === "appearance_full" && row.threshold !== null)
    .map((row) => row.threshold as number);
  const fullAppearanceMinutes = fullAppearance.length > 0 ? Math.min(...fullAppearance) : null;

  const rows: ScoringTableRow[] = [];
  for (const kind of SCORING_ROW_KINDS) {
    if (kind === "goal") {
      rows.push({ kind, n: null, cells: positions.map((position) => position.goalPoints) });
      continue;
    }
    if (kind === "clean_sheet") {
      rows.push({ kind, n: null, cells: positions.map((position) => position.cleanSheetPoints) });
      continue;
    }
    const ofKind = scoring.filter((row) => row.category === kind);
    // One table row per threshold, smallest first (a ruleset could score
    // "every 3 saves" and "every 6 saves" separately).
    const thresholds = [...new Set(ofKind.map((row) => row.threshold))].sort(
      (a, b) => (a ?? -1) - (b ?? -1),
    );
    for (const rowThreshold of thresholds) {
      const group = ofKind.filter((row) => row.threshold === rowThreshold);
      // A row naming a position wins over the every-position row for that
      // column; the every-position row fills the rest.
      const cells = columns.map(
        (code) =>
          group.find((row) => row.position === code)?.points ??
          group.find((row) => row.position === null)?.points ??
          null,
      );
      if (cells.every((cell) => cell === null)) continue;
      rows.push({
        kind,
        n:
          kind === "appearance_short"
            ? fullAppearanceMinutes
            : THRESHOLD_CATEGORIES.has(kind)
              ? rowThreshold
              : null,
        cells,
      });
    }
  }
  return { columns, rows, fullAppearanceMinutes };
}

/* ------------------------------------------------------------------ */
/* Chips                                                               */
/* ------------------------------------------------------------------ */

/** The order the rules page lists the chips in. */
export const RULES_CHIP_ORDER = ["wildcard", "triple_captain", "free_hit", "bench_boost"] as const;
export type RulesChipType = (typeof RULES_CHIP_ORDER)[number];

/** The rounds one allocation can be played in; `to: null` runs to the season's end. */
export interface ChipWindow {
  readonly from: number;
  readonly to: number | null;
}

export interface RulesChip {
  readonly chip: RulesChipType;
  /** One window per allocation, earliest first. A Wildcard split in two has two. */
  readonly windows: readonly ChipWindow[];
}

const gameweek = z.number().int().positive();
const chipRow = z
  .object({
    chipType: z.enum(RULES_CHIP_ORDER),
    startsAtGameweek: gameweek,
    endsAtGameweek: gameweek.nullable().optional(),
  })
  .refine((row) => row.endsAtGameweek == null || row.endsAtGameweek >= row.startsAtGameweek);

/** The chips the ruleset allocates, each with the rounds it can be played in. */
export function buildChipList(chips: unknown): RulesChip[] {
  const read = readRows(chips, chipRow);
  return RULES_CHIP_ORDER.flatMap((chip) => {
    const windows = read
      .filter((row) => row.chipType === chip)
      .map((row) => ({ from: row.startsAtGameweek, to: row.endsAtGameweek ?? null }))
      .sort((a, b) => a.from - b.from);
    return windows.length > 0 ? [{ chip, windows }] : [];
  });
}

/* ------------------------------------------------------------------ */
/* Templates                                                           */
/* ------------------------------------------------------------------ */

export type TemplatePart =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "slot"; readonly name: string };

/**
 * A dictionary line split around its `{name}` slots, so a screen can put
 * each figure in its own `<bdi>` instead of splicing a string: "{free}
 * انتقال مجاني…" keeps its digits in place inside an Arabic line.
 */
export function templateParts(template: string): TemplatePart[] {
  const parts: TemplatePart[] = [];
  const slot = /\{(\w+)\}/g;
  let last = 0;
  for (const match of template.matchAll(slot)) {
    const at = match.index ?? 0;
    if (at > last) parts.push({ kind: "text", text: template.slice(last, at) });
    parts.push({ kind: "slot", name: match[1] });
    last = at + match[0].length;
  }
  if (last < template.length) parts.push({ kind: "text", text: template.slice(last) });
  return parts;
}
