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

/**
 * The DOM id of one option, for `aria-activedescendant`. Built from the
 * option's own kind and id, not its position, so it stays the same while the
 * list reorders under the visitor's typing. Anything that is not safe in an
 * id reference (a space ends the reference) is made an underscore.
 */
export function searchOptionId(listId: string, entry: Pick<SearchEntry, "kind" | "id">): string {
  return `${listId}-${entry.kind}-${entry.id}`.replace(/\s/g, "_");
}

/**
 * What the field's `aria-activedescendant` names: the active option's id,
 * and nothing when no option is on screen (closed panel, empty or loading
 * list, nothing active). An id that points at nothing is worse than none.
 */
export function activeDescendantId(input: {
  listId: string;
  results: readonly SearchEntry[];
  active: number;
  panelVisible: boolean;
}): string | undefined {
  const entry = committableEntry(input.results, input.active, input.panelVisible);
  return entry ? searchOptionId(input.listId, entry) : undefined;
}

/**
 * Whether a key event belongs to an input method (a Japanese, Chinese or
 * Korean candidate list): its Enter and arrows pick a candidate and must not
 * also pick a search result. Only the standard `isComposing` flag is read: a
 * soft keyboard that reports every key as keyCode 229 would otherwise lose
 * its Enter.
 */
export function isComposingKey(event: { isComposing?: boolean }): boolean {
  return event.isComposing === true;
}

/**
 * What a screen reader is told as the list changes (a polite live region that
 * stays in the page): the number of results (and that some could not be
 * read), that it is loading, that there is none, or that the search is
 * unavailable. Nothing while the panel is closed. It is the live region that
 * speaks, not the visible note: a note that appears already filled is often
 * not read.
 */
export type SearchAnnouncement =
  | { kind: "results"; count: number; partial: boolean }
  | { kind: "loading" }
  | { kind: "empty" }
  | { kind: "unavailable"; coverage: "none" | "partial" }
  | null;

export function searchAnnouncement(input: {
  panelVisible: boolean;
  panel: SearchPanelState;
  resultCount: number;
}): SearchAnnouncement {
  if (!input.panelVisible) return null;
  const { panel } = input;
  if (panel.kind === "results")
    return { kind: "results", count: input.resultCount, partial: panel.partial };
  if (panel.kind === "loading") return { kind: "loading" };
  if (panel.kind === "empty") return { kind: "empty" };
  return { kind: "unavailable", coverage: panel.coverage };
}

/**
 * Whether the field may claim the list is open: only while the listbox is
 * really drawn (there are options). "Searching" and "no result" are lines
 * beside it, and an expanded field with nothing to choose is a lie.
 */
export function listboxExpanded(input: { panelVisible: boolean; resultCount: number }): boolean {
  return input.panelVisible && input.resultCount > 0;
}

/** How one catalog (clubs, players) is doing, as the search panel needs it. */
export interface SearchSourceHealth {
  pending: boolean;
  failed: boolean;
}

export type SearchPanelState =
  | { kind: "results"; partial: boolean }
  | { kind: "loading" }
  /** Nothing to show and a catalog failed; `coverage` says whether any catalog did load. */
  | { kind: "unavailable"; coverage: "none" | "partial" }
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
  if (!failed) return { kind: "empty" };
  const allFailed = input.sources.every((source) => source.failed);
  return { kind: "unavailable", coverage: allFailed ? "none" : "partial" };
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
