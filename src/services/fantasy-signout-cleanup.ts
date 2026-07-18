// Pass 3.1 — Testable sign-out cleanup for owned Fantasy data.
//
// Removes only:
//   1. Owned React Query cache entries (scoped by our OWNED_FANTASY_KEY_ROOT).
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

import type { QueryClient } from "@tanstack/react-query";
import { clearOwnedFantasyCache } from "@/services/fantasy-data-source";
import { fantasyDraftsStore } from "@/services/fantasy-drafts-store";

export interface SignOutCleanupInput {
  qc: QueryClient;
  uid: string | null;
}

export function cleanupOwnedFantasyOnSignOut({ qc, uid }: SignOutCleanupInput): void {
  // Owned queries: keyed by OWNED_FANTASY_KEY_ROOT regardless of UID.
  clearOwnedFantasyCache(qc);
  // Drafts: scoped by UID so other users' drafts stay intact if they
  // happen to share the same browser storage.
  if (uid) fantasyDraftsStore.clearForUid(uid);
}
