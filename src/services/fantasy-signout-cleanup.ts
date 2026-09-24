// Pass 3.1 — Testable sign-out cleanup for owned Fantasy data.
//
// Removes only:
//   1. Owned React Query cache entries (scoped by our OWNED_FANTASY_KEY_ROOT)
//      of every owner except the incoming one — see below.
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
//   - The incoming owner's owned queries. This runs in an effect, after the
//     render that has already started them (the signed-out guest's snapshot,
//     or the next account's); removing them strands the screen on "Loading…".
//     See `clearOwnedFantasyCacheExcept`.

import type { QueryClient } from "@tanstack/react-query";
import { clearOwnedFantasyCacheExcept } from "@/services/fantasy-data-source";
import { fantasyDraftsStore } from "@/services/fantasy-drafts-store";

export interface SignOutCleanupInput {
  qc: QueryClient;
  uid: string | null;
  /** The owner segment of the identity arriving, from `fantasyKeyOwner`. */
  keepOwner: string;
}

export function cleanupOwnedFantasyOnSignOut({ qc, uid, keepOwner }: SignOutCleanupInput): void {
  // Owned queries: every owner's but the incoming one's, whatever the UID.
  clearOwnedFantasyCacheExcept(qc, keepOwner);
  // Drafts: scoped by UID so other users' drafts stay intact if they
  // happen to share the same browser storage.
  if (uid) fantasyDraftsStore.clearForUid(uid);
}
