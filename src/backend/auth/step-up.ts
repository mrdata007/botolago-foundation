// The database's "confirm your code first" refusal, and the one place the app
// hears about it.
//
// An account that has enrolled a second factor may be holding a session that
// only reached AAL1 (password or link, no code yet). The server refuses that
// session's writes to the account's own data, and its sensitive account RPCs,
// with PostgREST code `PT403` (HTTP 403) and the message `mfa_required`. The
// refusal can arrive from any domain -- a follow, a Fantasy save, a Pronostics
// pick, a deletion request -- and each domain's mapper turns it into its own
// error type. Left there it read as that domain's generic failure ("Une erreur
// est survenue"), which tells the reader nothing about the code they owe.
//
// So every ordinary-account mapper reports it here on the way through, and the
// auth layer (`SecondFactorGate`) listens: it re-reads the session's assurance
// and, when a code really is owed, takes the reader to the challenge. Admin and
// editorial errors are deliberately NOT reported: their own screens already
// handle their server-enforced MFA states, and this must not reroute them.
// News has one mapper for both (`mapNewsError`, which the CMS screens use), so
// there only the reader's saved list reports, through `mapReaderListError`.
//
// Nothing here imports React, the router or the Supabase client, so the
// mappers (some of which also run on the server, where nobody listens) can
// depend on it freely.

/** PostgREST's code for a function that raised with `errcode = 'PT403'`. */
export const MFA_STEP_UP_CODE = "PT403";
/** The message the database raises alongside it. Matched exactly. */
export const MFA_STEP_UP_MESSAGE = "mfa_required";

interface ErrorLike {
  readonly code?: unknown;
  readonly message?: unknown;
  readonly cause?: unknown;
}

/** Mapped errors wrap the raw one as `cause`; a few layers is all the app nests. */
const MAX_CAUSE_DEPTH = 6;

function isRawStepUp(value: ErrorLike): boolean {
  return (
    value.code === MFA_STEP_UP_CODE &&
    typeof value.message === "string" &&
    value.message.trim().toLowerCase() === MFA_STEP_UP_MESSAGE
  );
}

/**
 * True when `error` is -- or wraps, through any `cause` chain a domain mapper
 * built -- the database's `PT403 mfa_required` refusal.
 *
 * Exact on both parts. `PT403` alone also carries `account_banned` and
 * `predictions_unavailable`, and a substring match on the message would catch
 * admin codes such as `staff_user_mfa_required`, whose screens own them.
 */
export function isMfaStepUpError(error: unknown): boolean {
  const seen = new Set<unknown>();
  let current: unknown = error;
  for (let depth = 0; depth < MAX_CAUSE_DEPTH; depth++) {
    if (current === null || typeof current !== "object" || seen.has(current)) return false;
    seen.add(current);
    const value = current as ErrorLike;
    if (isRawStepUp(value)) return true;
    current = value.cause;
  }
  return false;
}

type StepUpListener = () => void;
const listeners = new Set<StepUpListener>();

/** Subscribe to step-up refusals. Returns the unsubscribe function. */
export function onMfaStepUpRequired(listener: StepUpListener): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

/**
 * Tell the auth layer when `error` is a step-up refusal; do nothing otherwise.
 * Returns whether it was one, so a caller can skip its own generic message.
 *
 * Mappers can run more than once on one failure (a Fantasy error is mapped by
 * the repository and again by the screen's adapter); the listener is expected
 * to collapse repeats, and a listener that throws must not stop the mapping.
 */
export function reportMfaStepUp(error: unknown): boolean {
  if (!isMfaStepUpError(error)) return false;
  for (const listener of [...listeners]) {
    try {
      listener();
    } catch {
      /* the mapper's own result matters more than a broken listener */
    }
  }
  return true;
}
