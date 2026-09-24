/**
 * Where each starter stands on the Compos pitch (A-Lineups): the lines of a
 * formation, read from what the lineups payload actually carries — the
 * formation string, each player's position group and the provider's order.
 * There are no pitch coordinates in the data, so this never invents one:
 * when the formation and the players do not agree, it says so (`null`) and
 * the screen falls back to a list.
 *
 * Pure, and kept out of `LineupsView.tsx` so that file exports components
 * only; `LineupsView` re-exports `sortStartingXi`, which its test pins.
 */

export interface PitchPlayer {
  readonly position: string | null;
  readonly order: number;
}

const POSITION_ORDER: Record<string, number> = {
  goalkeeper: 0,
  defender: 1,
  midfielder: 2,
  forward: 3,
};

/** Starting XI grouped GK → DEF → MID → FWD, then by the provider's own
 * on-pitch order within each group. Unknown positions go last. */
export function sortStartingXi<T extends PitchPlayer>(players: readonly T[]): T[] {
  return [...players].sort(
    (a, b) =>
      (POSITION_ORDER[a.position ?? ""] ?? 9) - (POSITION_ORDER[b.position ?? ""] ?? 9) ||
      a.order - b.order,
  );
}

/** The widest line a pitch row can hold at 320px without the names colliding. */
export const MAX_LINE_SIZE = 6;

/**
 * "4-2-3-1" → [4, 2, 3, 1]: the OUTFIELD lines, defence first. `null` for a
 * missing or malformed formation, or one whose lines do not make ten.
 */
export function parseFormation(formation: string | null | undefined): number[] | null {
  if (!formation) return null;
  const parts = formation.trim().split("-");
  if (parts.length < 2) return null;
  const lines: number[] = [];
  for (const part of parts) {
    if (!/^\d+$/.test(part)) return null;
    const size = Number(part);
    if (size < 1 || size > MAX_LINE_SIZE) return null;
    lines.push(size);
  }
  return lines.reduce((sum, size) => sum + size, 0) === 10 ? lines : null;
}

/**
 * The starting XI as lines, goalkeeper first: `[[gk], [d, d, d, d], …]`.
 *
 * With a formation, the sorted outfield players are cut into its lines in
 * order — the formation says how many stand in each line, the position
 * groups and the provider order say who. Without one, the position groups
 * themselves are the lines (a 4-4-2 still reads as one). `null` when neither
 * works: no single goalkeeper, a player with no known position, not eleven
 * starters, or a line too wide to draw.
 */
export function pitchLines<T extends PitchPlayer>(
  starting: readonly T[],
  formation: string | null | undefined,
): T[][] | null {
  if (starting.length !== 11) return null;
  const sorted = sortStartingXi(starting);
  if (sorted.some((player) => !(player.position && player.position in POSITION_ORDER))) {
    return null;
  }
  const keepers = sorted.filter((player) => player.position === "goalkeeper");
  if (keepers.length !== 1) return null;
  const outfield = sorted.filter((player) => player.position !== "goalkeeper");

  const counts = parseFormation(formation);
  if (counts) {
    const lines: T[][] = [];
    let cursor = 0;
    for (const size of counts) {
      lines.push(outfield.slice(cursor, cursor + size));
      cursor += size;
    }
    return [keepers, ...lines];
  }

  const byGroup = ["defender", "midfielder", "forward"]
    .map((group) => outfield.filter((player) => player.position === group))
    .filter((line) => line.length > 0);
  if (byGroup.some((line) => line.length > MAX_LINE_SIZE)) return null;
  return [keepers, ...byGroup];
}

/**
 * Horizontal position of the `index`-th player of a line of `count`, as a
 * percentage of the pitch width from the INLINE START (the pitch places it
 * with `inset-inline-start`, so Arabic mirrors it like everything else).
 *
 * `mirrored` is the away side: it attacks down the screen, so its players
 * are laid out from the other touchline, as seen from the home end.
 */
export function slotInlineStart(index: number, count: number, mirrored: boolean): number {
  const slot = mirrored ? count - 1 - index : index;
  return ((slot + 0.5) / count) * 100;
}

/**
 * Vertical position of line `line` of `lineCount` (0 = the goalkeeper) as a
 * percentage of the whole pitch height from its top. The away side fills the
 * top half from its own goal line down to the centre; home the bottom half
 * from its goal line up. Lines are spread evenly across the half, with half a
 * line of room at each end so a disc never sits on a line marking.
 */
export function lineBlockStart(line: number, lineCount: number, side: "home" | "away"): number {
  const inHalf = ((line + 0.5) / lineCount) * 50;
  return side === "away" ? inHalf : 100 - inHalf;
}
