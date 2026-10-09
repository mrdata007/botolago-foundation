/**
 * The motive typed for a sensitive Admin action, kept as a draft in this tab.
 *
 * WHY
 *
 * The database refuses a sensitive action when the sign-in is older than 15
 * minutes (`recent_auth_required`). The fix is to sign in again, which leaves
 * the page -- and the confirm step used to reset on any refusal, so the motive
 * the owner had just written for that action was gone by the time they came
 * back. This keeps it.
 *
 * WHAT IT KEEPS, AND FOR WHAT
 *
 * One draft at a time, recorded with the page it was typed on (pathname) and
 * the action's own key (`ban:<userId>`, `approve:<approvalId>`...). It is read
 * back only for that exact page AND key, so a motive written about one object
 * can never surface in another action or on another row -- the same rule
 * `destructive-action.ts` enforces in memory. It lives in `sessionStorage`:
 * this tab only, gone when the tab closes, never sent anywhere.
 *
 * It is cleared when the action succeeds or is abandoned. A refusal keeps it.
 * `resume` is set only by "Se reconnecter": on return, that one action opens
 * its confirm step again with the motive in place. Any other time the draft
 * merely prefills the field when the same action is armed again.
 *
 * Every storage access is wrapped: a private window or blocked site data
 * makes it a no-op, never an error.
 */

export const MOTIVE_DRAFT_STORAGE_KEY = "botolago.admin.motive-draft";

export interface MotiveDraft {
  readonly path: string;
  readonly actionKey: string;
  readonly reason: string;
  /** Set by "Se reconnecter": re-open this action's confirm step on return. */
  readonly resume: boolean;
}

/** The slice of `Storage` used here, so tests can pass a plain object. */
export type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function browserStorage(): DraftStorage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

function read(storage: DraftStorage | null): MotiveDraft | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(MOTIVE_DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<MotiveDraft>;
    if (
      typeof value.path !== "string" ||
      typeof value.actionKey !== "string" ||
      typeof value.reason !== "string"
    ) {
      return null;
    }
    return {
      path: value.path,
      actionKey: value.actionKey,
      reason: value.reason,
      resume: value.resume === true,
    };
  } catch {
    return null;
  }
}

function write(storage: DraftStorage | null, draft: MotiveDraft | null): void {
  if (!storage) return;
  try {
    if (draft === null) storage.removeItem(MOTIVE_DRAFT_STORAGE_KEY);
    else storage.setItem(MOTIVE_DRAFT_STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // Full or blocked storage: the draft is a convenience, never a failure.
  }
}

function matches(draft: MotiveDraft | null, path: string, actionKey: string): draft is MotiveDraft {
  return draft !== null && draft.path === path && draft.actionKey === actionKey;
}

/** Records what is typed for `actionKey` on `path`; an empty motive removes the draft. */
export function saveMotiveDraft(
  path: string,
  actionKey: string,
  reason: string,
  storage: DraftStorage | null = browserStorage(),
): void {
  if (reason.trim().length === 0) {
    if (matches(read(storage), path, actionKey)) write(storage, null);
    return;
  }
  write(storage, { path, actionKey, reason, resume: false });
}

/** The motive kept for exactly this page and action, or `null`. */
export function readMotiveDraft(
  path: string,
  actionKey: string,
  storage: DraftStorage | null = browserStorage(),
): string | null {
  const draft = read(storage);
  return matches(draft, path, actionKey) ? draft.reason : null;
}

/** Forgets the draft of this page and action (success, or "Abandonner"). */
export function clearMotiveDraft(
  path: string,
  actionKey: string,
  storage: DraftStorage | null = browserStorage(),
): void {
  if (matches(read(storage), path, actionKey)) write(storage, null);
}

/** "Se reconnecter" was pressed on `path`: re-open its drafted action on return. */
export function markMotiveDraftForResume(
  path: string,
  storage: DraftStorage | null = browserStorage(),
): void {
  const draft = read(storage);
  if (draft && draft.path === path) write(storage, { ...draft, resume: true });
}

/**
 * The motive to re-open `actionKey` with after a re-sign-in, or `null`. Taken
 * once: the `resume` mark is dropped, the draft itself stays until the action
 * succeeds or is abandoned.
 */
export function takeResumableMotiveDraft(
  path: string,
  actionKey: string,
  storage: DraftStorage | null = browserStorage(),
): string | null {
  const draft = read(storage);
  if (!matches(draft, path, actionKey) || !draft.resume) return null;
  write(storage, { ...draft, resume: false });
  return draft.reason;
}

/** The page a draft belongs to: the path alone, never the query or the hash. */
export function currentDraftPath(): string {
  try {
    return typeof window === "undefined" ? "" : window.location.pathname;
  } catch {
    return "";
  }
}
