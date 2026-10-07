// Where the squad builder (`/fantasy/create`) keeps a first squad on this
// device, shared with the Fantasy hub so it can offer "Reprendre mon équipe".
//
// The builder writes the draft on every change (`fantasyDraftsStore`). A
// visitor's draft lives under `GUEST_DRAFT_KEY`; a signed-in manager without a
// team has their own key, and on first visit the builder adopts the visitor's
// draft into it. `createDraftProgress` follows the same order, so the hub
// counts the squad the builder will open.

import type { CreateTeamDraft } from "./fantasy-create-service";
import { fantasyDraftsStore, type FantasyDraftKey } from "./fantasy-drafts-store";

/** The visitor's draft: the builder's own key for someone with no account yet. */
export const GUEST_DRAFT_KEY: FantasyDraftKey = {
  uid: "__guest__",
  teamId: "new",
  baseVersion: 0,
  kind: "create-team",
};

/** A signed-in manager's first-squad draft, before any team exists. */
export function accountDraftKey(uid: string): FantasyDraftKey {
  return { uid, teamId: "new", baseVersion: 0, kind: "create-team" };
}

export function isCreateDraft(v: unknown): v is CreateTeamDraft {
  if (!v || typeof v !== "object") return false;
  const d = v as Partial<CreateTeamDraft>;
  return typeof d.teamName === "string" && Array.isArray(d.slots) && d.slots.length === 15;
}

/**
 * Players already picked in the draft the builder would open, and the squad
 * size; `null` when there is no draft or it holds nobody. Reads browser
 * storage, so call it after mount, never during a server render.
 */
export function createDraftProgress(uid: string | null): { filled: number; total: number } | null {
  const own = uid ? fantasyDraftsStore.read<unknown>(accountDraftKey(uid)) : null;
  const entry =
    own && isCreateDraft(own.payload) ? own : fantasyDraftsStore.read<unknown>(GUEST_DRAFT_KEY);
  if (!entry || !isCreateDraft(entry.payload)) return null;
  const filled = entry.payload.slots.filter((slot) => slot.playerId).length;
  return filled > 0 ? { filled, total: entry.payload.slots.length } : null;
}
