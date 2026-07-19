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

import { readJSON, writeJSON, removeKey } from "@/lib/storage";

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

export function flattenDraftKey(k: FantasyDraftKey): string {
  return `${k.uid}::${k.teamId}::${k.baseVersion}::${k.kind}`;
}

function isValidEntry(v: unknown): v is FantasyDraftEntry {
  if (!v || typeof v !== "object") return false;
  const e = v as Partial<FantasyDraftEntry>;
  if (!e.key || typeof e.key !== "object") return false;
  const k = e.key;
  return (
    typeof k.uid === "string" && k.uid.length > 0 &&
    (typeof k.teamId === "string") &&
    typeof k.baseVersion === "number" && Number.isFinite(k.baseVersion) &&
    (k.kind === "team" || k.kind === "transfers" || k.kind === "create-team") &&
    typeof e.updatedAt === "number" &&
    "payload" in e
  );
}

function readMap(): StoredMap {
  const raw = readJSON<StoredMap>(KEY);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: StoredMap = {};
  for (const [k, v] of Object.entries(raw)) {
    if (isValidEntry(v)) out[k] = v;
  }
  return out;
}

function writeMap(m: StoredMap): void {
  writeJSON<StoredMap>(KEY, m);
}

export const fantasyDraftsStore = {
  save<T>(key: FantasyDraftKey, payload: T): void {
    if (!key.uid) return;
    const m = readMap();
    m[flattenDraftKey(key)] = {
      key,
      payload,
      updatedAt: Date.now(),
    };
    writeMap(m);
  },

  read<T>(key: FantasyDraftKey): FantasyDraftEntry<T> | null {
    const m = readMap();
    const e = m[flattenDraftKey(key)];
    return (e as FantasyDraftEntry<T> | undefined) ?? null;
  },

  remove(key: FantasyDraftKey): void {
    const m = readMap();
    delete m[flattenDraftKey(key)];
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
        mutated = true;
      }
    }
    if (mutated) writeMap(m);
  },

  /** Dev/test only. */
  __resetAll(): void {
    removeKey(KEY);
  },
};
