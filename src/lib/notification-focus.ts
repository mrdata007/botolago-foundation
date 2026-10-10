/**
 * Where focus goes when a notification card is dismissed (the card stays on
 * screen, fading, for a moment, and is inert while it does).
 */

export type DismissFocusTarget =
  | { readonly kind: "card"; readonly id: string; readonly relation: "next" | "previous" }
  | { readonly kind: "heading" };

/**
 * The next card in the list, else the one before it, else the page heading.
 * `ids` are the cards still listed (the dismissed card included, in its place).
 */
export function dismissFocusTarget(ids: readonly string[], dismissed: string): DismissFocusTarget {
  const index = ids.indexOf(dismissed);
  const next = index >= 0 ? ids[index + 1] : undefined;
  if (next !== undefined) return { kind: "card", id: next, relation: "next" };
  const previous = index > 0 ? ids[index - 1] : undefined;
  if (previous !== undefined) return { kind: "card", id: previous, relation: "previous" };
  return { kind: "heading" };
}

/** The bits of `Document` the move needs, so it can be tested without a browser. */
export interface FocusRoot {
  readonly activeElement: Element | null;
  readonly body: Element | null;
  querySelector(selector: string): Element | null;
}

const dismissSelector = (id: string) => `[data-dismiss-id="${id.replace(/["\\]/g, "\\$&")}"]`;

/**
 * Moves focus off a card that is being dismissed, if it was on it. Returns the target it chose, or null when focus was
 * elsewhere and was left alone.
 */
export function moveFocusAfterDismiss(
  root: FocusRoot,
  ids: readonly string[],
  dismissed: string,
): DismissFocusTarget | null {
  const leaving = root.querySelector(dismissSelector(dismissed))?.closest("li") ?? null;
  const active = root.activeElement;
  // Only when focus is on the leaving card: it is about to be lost with it. A
  // browser that does not focus a button on a mouse click (Safari) leaves
  // focus on the body, and that is left alone.
  if (!active || !leaving?.contains(active)) return null;
  const target = dismissFocusTarget(ids, dismissed);
  const element =
    target.kind === "card"
      ? (root.querySelector(dismissSelector(target.id)) as HTMLElement | null)
      : (root.querySelector("h1") as HTMLElement | null);
  if (!element) return null;
  if (target.kind === "heading") element.tabIndex = -1;
  element.focus({ preventScroll: true });
  return target;
}
