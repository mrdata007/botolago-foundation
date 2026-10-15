// The header search: one list of clubs and players, matched on what the
// visitor types. Matching ignores capitals and accents ("elouasti" finds
// "Élouasti"), and a word can start anywhere in the name.

export interface SearchEntry {
  kind: "club" | "player";
  id: string;
  label: string;
  /** Club name under a player, city under a club. */
  hint: string;
}

export function foldText(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/** Best matches first: names that start with the query, then any word start, then anywhere. */
export function searchEntries(entries: SearchEntry[], query: string, limit = 8): SearchEntry[] {
  const q = foldText(query);
  if (q.length === 0) return [];
  const scored: Array<{ entry: SearchEntry; score: number }> = [];
  for (const entry of entries) {
    const label = foldText(entry.label);
    let score = -1;
    if (label.startsWith(q)) score = 0;
    else if (label.split(/[\s'’-]+/).some((word) => word.startsWith(q))) score = 1;
    else if (label.includes(q)) score = 2;
    if (score >= 0) scored.push({ entry, score });
  }
  scored.sort(
    (a, b) =>
      a.score - b.score ||
      // Clubs before players on a tie: there are fewer of them.
      (a.entry.kind === b.entry.kind ? 0 : a.entry.kind === "club" ? -1 : 1) ||
      a.entry.label.localeCompare(b.entry.label),
  );
  return scored.slice(0, limit).map((s) => s.entry);
}

/**
 * The option the keyboard is on, kept inside what is shown: -1 when nothing is
 * listed, else 0 to count - 1. The page derives it on every render from the
 * stored index, so a list that shrank, or filled after an arrow press on an
 * empty one, never leaves the index on an option that is not there (audit
 * SOL-03).
 */
export function clampActiveIndex(active: number, count: number): number {
  if (count <= 0) return -1;
  if (!Number.isFinite(active) || active < 0) return 0;
  return Math.min(Math.trunc(active), count - 1);
}

/** ArrowDown / ArrowUp from the (clamped) active option, staying inside the list. */
export function moveActiveIndex(active: number, direction: "up" | "down", count: number): number {
  const current = clampActiveIndex(active, count);
  if (current < 0) return -1;
  return direction === "down" ? Math.min(current + 1, count - 1) : Math.max(current - 1, 0);
}

/**
 * What Enter may open: the active result, and only while the list is on screen
 * and the index is a real position in it. After Escape the results still exist
 * in memory but are not shown, so Enter must not act on them.
 */
export function committableEntry(
  results: readonly SearchEntry[],
  active: number,
  panelVisible: boolean,
): SearchEntry | undefined {
  if (!panelVisible || !Number.isInteger(active)) return undefined;
  return active >= 0 && active < results.length ? results[active] : undefined;
}

/** How one catalog (clubs, players) is doing, as the search panel needs it. */
export interface SearchSourceHealth {
  pending: boolean;
  failed: boolean;
}

export type SearchPanelState =
  | { kind: "results"; partial: boolean }
  | { kind: "loading" }
  | { kind: "unavailable" }
  | { kind: "empty" };

/**
 * What the panel says. "No result" is only true once every catalog has loaded;
 * a catalog that failed is "unavailable", and matches from the other one are
 * kept and flagged partial (audit UX-007).
 */
export function searchPanelState(input: {
  resultCount: number;
  sources: readonly SearchSourceHealth[];
}): SearchPanelState {
  const failed = input.sources.some((source) => source.failed);
  if (input.resultCount > 0) return { kind: "results", partial: failed };
  if (input.sources.some((source) => source.pending)) return { kind: "loading" };
  return failed ? { kind: "unavailable" } : { kind: "empty" };
}

/** One character with capitals and accents folded away; may be empty or longer than one. */
function foldChar(char: string): string {
  return char.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export interface HighlightPart {
  text: string;
  match: boolean;
}

/**
 * `label` cut into the part the query matched and the rest, so the letters
 * typed can be picked out. Ignores capitals and accents, like the search, and
 * cuts at the original letters ("Élouasti" with "elo" gives "Élo" + "uasti").
 * A query that is not in the label gives the label whole.
 */
export function highlightParts(label: string, query: string): HighlightPart[] {
  const q = foldText(query);
  if (q.length === 0) return [{ text: label, match: false }];
  let folded = "";
  const origin: number[] = [];
  const chars = Array.from(label);
  // Positions are counted in the label's own UTF-16 units, so the cut is exact.
  const offsets: number[] = [];
  let unit = 0;
  chars.forEach((char) => {
    offsets.push(unit);
    unit += char.length;
  });
  chars.forEach((char, index) => {
    const f = foldChar(char);
    for (let k = 0; k < f.length; k += 1) origin.push(index);
    folded += f;
  });
  const at = folded.indexOf(q);
  if (at < 0) return [{ text: label, match: false }];
  const first = origin[at];
  const last = origin[at + q.length - 1];
  if (first === undefined || last === undefined) return [{ text: label, match: false }];
  const start = offsets[first] ?? 0;
  const end = (offsets[last] ?? 0) + (chars[last]?.length ?? 0);
  const parts: HighlightPart[] = [];
  if (start > 0) parts.push({ text: label.slice(0, start), match: false });
  parts.push({ text: label.slice(start, end), match: true });
  if (end < label.length) parts.push({ text: label.slice(end), match: false });
  return parts;
}
