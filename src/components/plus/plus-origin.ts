/**
 * Where the offer began. The offer is one flow across several pages (`/plus` → `/curva/plus`, and a
 * round trip through sign-up), so the history entry it began at cannot live in one component: a page
 * that mounts again would take its own entry as the beginning, and Close would stop at the previous
 * page of the flow instead of leaving it. The page that is about to leave for the next one leaves a
 * note here (the index of the offer's first history entry); the next page reads it back. Session
 * storage only; blocked storage just means each page counts from where it mounted.
 */
const KEY = "botolago.plus.origin";
/** A note older than this is a reader who went elsewhere: it never reaches a later, unrelated visit. */
const MAX_AGE_MS = 30 * 60_000;

/** The offer is about to continue on another page (or in sign-up): remember where it began. */
export function rememberOfferOrigin(entry: number): void {
  try {
    window.sessionStorage.setItem(KEY, `${Date.now()}|${entry}`);
  } catch {
    // storage is blocked: the next page counts from where it mounts
  }
}

/**
 * The index of the offer's first entry, when the page at `index` continues an offer that began
 * earlier in this history (the note is fresh and the page is further along than where it began);
 * otherwise `index` itself. Reading does not remove the note, so a page that renders twice agrees
 * with itself; `clearOfferOrigin` does.
 */
export function offerEntry(index: number): number {
  try {
    const value = window.sessionStorage.getItem(KEY);
    if (value === null) return index;
    const cut = value.indexOf("|");
    const at = Number(value.slice(0, cut));
    const entry = Number(value.slice(cut + 1));
    const fresh = cut > 0 && Date.now() - at < MAX_AGE_MS;
    return fresh && Number.isInteger(entry) && entry >= 0 && entry < index ? entry : index;
  } catch {
    return index;
  }
}

export function clearOfferOrigin(): void {
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    // nothing to clear
  }
}
