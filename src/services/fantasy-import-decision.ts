// Pass 3.1 — Per-UID import-decision service.
//
// Tracks whether an authenticated user has already:
//   - imported their local team into the cloud ("imported"), or
//   - explicitly chosen to start a new cloud team ("start_new").
//
// `Plus tard` (later) is transient and MUST NOT persist a marker; the prompt
// re-appears on the next eligibility check. Failed imports must NOT set the
// marker either — the user retries or dismisses.
//
// Keys are scoped by auth UID so switching accounts never bleeds one user's
// decision onto another.

import { readJSON, writeJSON, removeKey } from "@/lib/storage";

export type ImportDecisionState = "imported" | "start_new";

interface StoredMap {
  [uid: string]: ImportDecisionState;
}

const KEY = "fantasy.import-decision";

function readMap(): StoredMap {
  const raw = readJSON<StoredMap>(KEY);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw;
}

function writeMap(m: StoredMap): void {
  writeJSON<StoredMap>(KEY, m);
}

export const importDecisionService = {
  /** Read the current marker (or null if none / `Plus tard` only). */
  get(uid: string): ImportDecisionState | null {
    if (!uid) return null;
    const m = readMap();
    const v = m[uid];
    return v === "imported" || v === "start_new" ? v : null;
  },

  /** Marker set ONLY after a successful cloud import. */
  markImported(uid: string): void {
    if (!uid) return;
    const m = readMap();
    m[uid] = "imported";
    writeMap(m);
  },

  /** Marker set when the user explicitly chose to start a new cloud team. */
  markStartNew(uid: string): void {
    if (!uid) return;
    const m = readMap();
    m[uid] = "start_new";
    writeMap(m);
  },

  /**
   * Clear only this UID's marker. Development-only: retained for repl / test
   * teardown. Production surfaces should NOT expose this destructively.
   */
  __resetForDev(uid?: string): void {
    if (!uid) {
      removeKey(KEY);
      return;
    }
    const m = readMap();
    delete m[uid];
    writeMap(m);
  },
};

export interface ImportEligibilityInput {
  authMode: "supabase" | "mock";
  isAuthenticated: boolean;
  uid: string | null;
  emptyCloudSquad: boolean;
  localSquadSize: number;
  localTeamValid: boolean;
}

/**
 * True when the empty-cloud import prompt should render.
 * Rules — all must hold:
 *   1. Supabase auth mode
 *   2. Authenticated user with a UID
 *   3. Cloud team exists but has no squad rows
 *   4. Local repository has a complete 15-player squad that validates
 *   5. No per-UID marker exists ("Plus tard" leaves this false = eligible)
 */
export function isImportPromptEligible(input: ImportEligibilityInput): boolean {
  if (input.authMode !== "supabase") return false;
  if (!input.isAuthenticated || !input.uid) return false;
  if (!input.emptyCloudSquad) return false;
  if (input.localSquadSize !== 15) return false;
  if (!input.localTeamValid) return false;
  if (importDecisionService.get(input.uid) !== null) return false;
  return true;
}
