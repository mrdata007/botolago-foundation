/**
 * The face-à-face sheet is a sheet on the page, not an address: leaving for the offer closes it. The
 * duel's « Découvrir » leaves a note here (the rival's team) and the people page reads it back when
 * the reader returns, so closing the offer lands on the sheet that was open. Session storage only;
 * blocked storage just means the sheet stays closed.
 */
const KEY = "botolago.plus.return.duel";
/** A note older than this is a reader who went elsewhere: the sheet does not reopen out of nowhere. */
const MAX_AGE_MS = 10 * 60_000;

export function rememberDuelReturn(teamId: string): void {
  try {
    window.sessionStorage.setItem(KEY, `${Date.now()}|${teamId}`);
  } catch {
    // storage is blocked: the sheet stays closed
  }
}

/** The rival whose sheet was open when the reader left for the offer, once; then forgotten. */
export function takeDuelReturn(): string | null {
  try {
    const value = window.sessionStorage.getItem(KEY);
    if (value === null) return null;
    window.sessionStorage.removeItem(KEY);
    const cut = value.indexOf("|");
    const at = Number(value.slice(0, cut));
    return cut > 0 && Date.now() - at < MAX_AGE_MS ? value.slice(cut + 1) : null;
  } catch {
    return null;
  }
}
