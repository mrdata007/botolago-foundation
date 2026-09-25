// Pass 3.1 — Testable sign-out cleanup for owned Fantasy data.
//
// Removes only:
//   1. The outgoing UID's owned React Query cache entries (OWNED_FANTASY_KEY_ROOT
//      keys whose owner is that UID).
//   2. Fantasy drafts belonging to the outgoing UID.
//   3. Transient import prompt state (nothing to clear currently —
//      `importDecisionService` stores durable per-UID choices, not transient
//      session flags — reserved for future dialog-open flags).
//
// It MUST preserve:
//   - Public news / football / player / club query caches.
//   - Guest/local prototype `fantasy.state` store (used when the user signs
//     out and returns as a guest, or another guest uses the browser).
//   - Other UIDs' import-decision markers.
//   - Every other owner's owned entries, the incoming one's above all. It runs
//     from AuthProvider's effect, after the render that switched accounts has
//     already built the next owner's queries (B's, or the visitor's
//     `__local__` ones) and started their reads. Clearing every owned entry,
//     as it did until 2026-09-25, removed those too: each read was cancelled
//     and its screen sat on its loading placeholder for good (the bug
//     `clearOtherOwnersFantasyCache` fixed for the provider's own cleanup).
//     FantasyOwnedProvider already drops every other owner's entries on each
//     identity change, keeping only the current one's.

import type { QueryClient } from "@tanstack/react-query";
import { clearOwnedFantasyCache, isOwnedFantasyKey } from "@/services/fantasy-data-source";
import { fantasyDraftsStore } from "@/services/fantasy-drafts-store";

export interface SignOutCleanupInput {
  qc: QueryClient;
  uid: string | null;
}

export function cleanupOwnedFantasyOnSignOut({ qc, uid }: SignOutCleanupInput): void {
  if (uid) {
    // Owned queries: `[OWNED_FANTASY_KEY_ROOT, source, owner, …]`, this owner's.
    qc.removeQueries({
      predicate: (q) => isOwnedFantasyKey(q.queryKey) && q.queryKey[2] === uid,
    });
    // Drafts: scoped by UID so other users' drafts stay intact if they
    // happen to share the same browser storage.
    fantasyDraftsStore.clearForUid(uid);
    return;
  }
  // No outgoing account named: nothing tells whose an entry is, so every
  // owned one goes, as before. Every caller that knows the account passes it.
  clearOwnedFantasyCache(qc);
}
