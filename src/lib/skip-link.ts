// The shells' "skip to content" bypass (audit MOB-05): the id every shell's
// `<main>` carries, and the move that puts keyboard focus on it.

/** The id of the page's `<main>` in every shell, which the skip link points at. */
export const MAIN_CONTENT_ID = "main-content";

/** What focusing the target needs of the document: little enough to stand in for. */
export interface SkipTargetDocument {
  getElementById(id: string): { focus(options?: FocusOptions): void } | null;
}

/**
 * Puts keyboard focus on the page's `<main>` (`tabindex="-1"`, so it is
 * focusable by script and not part of the Tab order). Returns whether there
 * was one to focus: a page without it leaves the link to its `#hash`.
 */
export function focusMainContent(doc: SkipTargetDocument): boolean {
  const main = doc.getElementById(MAIN_CONTENT_ID);
  if (!main) return false;
  main.focus();
  return true;
}
