// Pass 3.1 — User-scoped Fantasy draft store.
//
// Persists working drafts for authenticated cloud Team/Transfers edits so a
// refresh or navigation does not silently discard user work. Drafts are:
//   - Scoped by (uid, teamId or "new", baseVersion, kind).
//   - NEVER treated as authoritative. Cloud reads always win on load.
//   - Cleared on successful mutation matching the same key.
//   - Cleared for a UID on sign-out, without touching public caches or the
//     guest/local prototype `fantasy.state` store.
//
// Serialization is deterministic and validated on read so malformed stale
// entries are ignored safely rather than crashing consumers.

import { readJSON, tryWriteJSON, removeKey } from "@/lib/storage";

export type FantasyDraftKind = "team" | "transfers" | "create-team";

export interface FantasyDraftKey {
  uid: string;
  teamId: string | "new";
  baseVersion: number;
  kind: FantasyDraftKind;
}

export interface FantasyDraftEntry<T = unknown> {
  key: FantasyDraftKey;
  /** Payload is opaque here; route code owns the shape. */
  payload: T;
  updatedAt: number;
}

interface StoredMap {
  [flatKey: string]: FantasyDraftEntry;
}

const KEY = "fantasy.drafts";

/**
 * Drafts the browser would not keep (storage blocked or full), held in memory
 * for this visit. A page change inside the app (the sign-up screens) keeps
 * them; a reload does not, which is why `save` says whether the device took
 * the draft. They are read first, are dropped by `remove` / `clearForUid` like
 * any draft, and are cleared once a later write succeeds.
 */
const unsaved: StoredMap = {};

export function flattenDraftKey(k: FantasyDraftKey): string {
  return `${k.uid}::${k.teamId}::${k.baseVersion}::${k.kind}`;
}

function isValidEntry(v: unknown): v is FantasyDraftEntry {
  if (!v || typeof v !== "object") return false;
  const e = v as Partial<FantasyDraftEntry>;
  if (!e.key || typeof e.key !== "object") return false;
  const k = e.key;
  return (
    typeof k.uid === "string" &&
    k.uid.length > 0 &&
    typeof k.teamId === "string" &&
    typeof k.baseVersion === "number" &&
    Number.isFinite(k.baseVersion) &&
    (k.kind === "team" || k.kind === "transfers" || k.kind === "create-team") &&
    typeof e.updatedAt === "number" &&
    "payload" in e
  );
}

function readMap(): StoredMap {
  const raw = readJSON<StoredMap>(KEY);
  const out: StoredMap = {};
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    for (const [k, v] of Object.entries(raw)) {
      if (isValidEntry(v)) out[k] = v;
    }
  }
  for (const [k, v] of Object.entries(unsaved)) out[k] = v;
  return out;
}

/** True when the browser stored the map. */
function writeMap(m: StoredMap): boolean {
  const ok = tryWriteJSON<StoredMap>(KEY, m);
  if (ok) for (const k of Object.keys(unsaved)) delete unsaved[k];
  return ok;
}

export const fantasyDraftsStore = {
  /**
   * Whether the draft reached browser storage. `false`: the draft lives in
   * memory for this visit only (see `unsaved`), and a screen must not say it
   * is "kept on this device".
   */
  save<T>(key: FantasyDraftKey, payload: T): boolean {
    if (!key.uid) return false;
    // No device on the server: nothing to keep, and the module-level memory
    // below must never hold one visitor's draft for the next request.
    if (typeof window === "undefined") return false;
    const m = readMap();
    const flat = flattenDraftKey(key);
    const entry: FantasyDraftEntry = { key, payload, updatedAt: Date.now() };
    m[flat] = entry;
    const stored = writeMap(m);
    if (!stored) unsaved[flat] = entry;
    return stored;
  },

  read<T>(key: FantasyDraftKey): FantasyDraftEntry<T> | null {
    const m = readMap();
    const e = m[flattenDraftKey(key)];
    return (e as FantasyDraftEntry<T> | undefined) ?? null;
  },

  remove(key: FantasyDraftKey): void {
    const flat = flattenDraftKey(key);
    delete unsaved[flat];
    const m = readMap();
    delete m[flat];
    writeMap(m);
  },

  listForUid(uid: string): FantasyDraftEntry[] {
    if (!uid) return [];
    const m = readMap();
    return Object.values(m).filter((e) => e.key.uid === uid);
  },

  /** Remove every draft owned by `uid`. Public/local caches are untouched. */
  clearForUid(uid: string): void {
    if (!uid) return;
    const m = readMap();
    let mutated = false;
    for (const [flat, entry] of Object.entries(m)) {
      if (entry.key.uid === uid) {
        delete m[flat];
        delete unsaved[flat];
        mutated = true;
      }
    }
    if (mutated) writeMap(m);
  },

  /** True while this draft exists only in memory because the browser would not keep it. */
  hasUnsaved(key: FantasyDraftKey): boolean {
    return flattenDraftKey(key) in unsaved;
  },

  /** Dev/test only. */
  __resetAll(): void {
    for (const k of Object.keys(unsaved)) delete unsaved[k];
    removeKey(KEY);
  },
};
