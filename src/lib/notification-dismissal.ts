// Dismissing an inbox card: the card leaves at once, and comes back if the
// server refuses (audit UX-002). The hidden set is plain state; these are the
// pieces the page uses to hide, commit and roll back.

/** The set with `id` added. A new set: React state is never mutated. */
export function withHidden(current: ReadonlySet<string>, id: string): ReadonlySet<string> {
  return new Set(current).add(id);
}

/** The set without `id`; the same set when `id` was not in it. */
export function restoreHidden(current: ReadonlySet<string>, id: string): ReadonlySet<string> {
  if (!current.has(id)) return current;
  const next = new Set(current);
  next.delete(id);
  return next;
}

export interface OptimisticDismissal {
  hide: (id: string) => void;
  /** The server call; a rejection means the card was not dismissed. */
  commit: (id: string) => Promise<unknown>;
  restore: (id: string) => void;
  onFailure: (id: string) => void;
}

/**
 * Hides the card, asks the server, and on a refusal restores it exactly once
 * and reports the failure. Resolves `true` when the server accepted.
 */
export async function dismissOptimistically(
  id: string,
  deps: OptimisticDismissal,
): Promise<boolean> {
  deps.hide(id);
  try {
    await deps.commit(id);
    return true;
  } catch {
    deps.restore(id);
    deps.onFailure(id);
    return false;
  }
}
