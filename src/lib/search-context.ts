// The header search's place in the history, so Retour gives it back.
//
// The field lives in the bar of every primary screen, and a result leaves the
// page: Home → "Wydad" → the club. Coming back with Retour used to land on an
// empty field, and the reader had to type the name again to reach the next
// result. The query is written into the history entry the reader is leaving
// (`history.state`), not into a store shared by the whole tab, so it comes
// back exactly when that entry does: Retour restores it, and a fresh visit to
// the same page, which is a new entry, starts empty.
//
// `history.state` is spread rather than replaced: the router keeps its own
// entry key and index in it, and its scroll restoration is keyed on the key.

const STATE_KEY = "botolagoSearchQuery";

function historyState(): Record<string, unknown> | null {
  if (typeof window === "undefined") return null;
  try {
    const state: unknown = window.history.state;
    return state && typeof state === "object" ? (state as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Keep `query` on the history entry being left. A no-op for an empty query or no browser. */
export function rememberSearchQuery(query: string): void {
  if (typeof window === "undefined" || query.trim() === "") return;
  try {
    window.history.replaceState({ ...historyState(), [STATE_KEY]: query }, "");
  } catch {
    /* a browser that refuses (sandboxed frame, rate limit) just loses the restore */
  }
}

/** The query this history entry was left with, or "" when it was not left from a search result. */
export function recallSearchQuery(): string {
  const value = historyState()?.[STATE_KEY];
  return typeof value === "string" ? value : "";
}
