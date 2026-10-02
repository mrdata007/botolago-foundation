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
