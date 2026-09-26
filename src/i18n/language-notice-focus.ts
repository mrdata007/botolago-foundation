/**
 * Where keyboard focus goes when the Arabic-failure notice leaves
 * (`language-load-notice.tsx`).
 *
 * The notice leaves when the reader closes it, or when the Arabic its Retry
 * asked for arrives, and the button that had focus leaves with it. Focus used
 * to drop to the document's body, so a keyboard or screen-reader user was
 * left on nothing, and their next Tab started the page again from the top.
 * Now, when focus was in the notice as it left, it is handed to the language
 * switcher — what the notice was about, and the reader's other way to the
 * language — or, on a page whose bar has none (the match page's), to the
 * page's `<main>`. Focus that was anywhere else is left where it is: the
 * notice never takes focus, so it gives none back that it did not have.
 */

/** The language switcher's button (`LanguageSwitcher`), which focus is handed to first. */
export const LANGUAGE_SWITCHER_SELECTOR = "[data-language-switcher]";

/**
 * What handing focus to an element needs of it: little enough for the tests
 * to stand in for, as there is no DOM here.
 */
export interface FocusCandidate {
  focus(options?: FocusOptions): void;
  hasAttribute(name: string): boolean;
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
  addEventListener(type: "blur", listener: () => void, options: { once: true }): void;
}

/** The page around the notice as it leaves, still in the document. */
export interface NoticeFocusPage<T extends FocusCandidate> {
  /** Keyboard focus is in the notice. */
  readonly focusInNotice: boolean;
  /** The language switcher's buttons, in document order. */
  readonly switchers: Iterable<T>;
  /** The page's `<main>`. */
  readonly landmarks: Iterable<T>;
  /** Whether the element has focus now: one in the document but not drawn refuses it. */
  holdsFocus(element: T): boolean;
}

/**
 * Hands focus on as the notice leaves, and returns the element that took it:
 * `null` when focus was not the notice's to give, or nothing would take it.
 *
 * A `<main>` is not focusable by itself. It is made so for this one visit —
 * `tabindex="-1"`, which keeps it out of the Tab order — and put back as it
 * was when focus moves on. Neither move scrolls: the notice floats over the
 * page, so the reader stays where they were reading.
 */
export function returnFocusFromNotice<T extends FocusCandidate>(
  page: NoticeFocusPage<T>,
): T | null {
  if (!page.focusInNotice) return null;
  for (const switcher of page.switchers) {
    switcher.focus({ preventScroll: true });
    if (page.holdsFocus(switcher)) return switcher;
  }
  for (const landmark of page.landmarks) {
    const madeFocusable = !landmark.hasAttribute("tabindex");
    if (madeFocusable) landmark.setAttribute("tabindex", "-1");
    landmark.focus({ preventScroll: true });
    if (page.holdsFocus(landmark)) {
      if (madeFocusable) {
        landmark.addEventListener("blur", () => landmark.removeAttribute("tabindex"), {
          once: true,
        });
      }
      return landmark;
    }
    if (madeFocusable) landmark.removeAttribute("tabindex");
  }
  return null;
}
