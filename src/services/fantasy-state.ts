// Persistent Fantasy state store: chips, current gameweek, transfer hit,
// pre-Free-Hit snapshot, and last-computed gameweek results. Persists via
// namespaced localStorage so a page refresh preserves everything.
//
// Emits a single "fantasy.state.changed" browser event after every real
// mutation. Callers hydrating from a remote source can pass
// { internal: true } to suppress the echo.

import { readJSON, writeJSON } from "@/lib/storage";
import { DEFAULT_CHIPS, type ChipsState } from "@/lib/fantasy-engine";
import type { PointsViewModel } from "@/services/points-service";

export interface FantasyPersistedState {
  chips: ChipsState;
  currentGameweek: number;
  transferHitPoints: number;
  /** Finalized/cached gameweek results, keyed by gameweek number. */
  results: Record<number, PointsViewModel>;
}

const KEY = "fantasy.state";
export const FANTASY_STATE_EVENT = "fantasy.state.changed";

export const DEFAULT_STATE: FantasyPersistedState = {
  chips: DEFAULT_CHIPS,
  currentGameweek: 1,
  transferHitPoints: 0,
  results: {},
};

/** Guarded, one-frame-safe event dispatch. */
function emitChanged() {
  if (typeof window === "undefined") return;
  if (typeof window.dispatchEvent !== "function") return;
  if (typeof CustomEvent !== "function") return;
  window.dispatchEvent(new CustomEvent(FANTASY_STATE_EVENT));
}

/** Reentrancy guard so nested public calls emit exactly once. */
let depth = 0;
function runMutation(fn: () => void, opts?: { internal?: boolean }) {
  depth++;
  try {
    fn();
  } finally {
    depth--;
    if (depth === 0 && !opts?.internal) emitChanged();
  }
}

export const fantasyStateStore = {
  read(): FantasyPersistedState {
    const raw = readJSON<Partial<FantasyPersistedState>>(KEY);
    return {
      chips: raw?.chips ?? DEFAULT_CHIPS,
      currentGameweek: raw?.currentGameweek ?? DEFAULT_STATE.currentGameweek,
      transferHitPoints: raw?.transferHitPoints ?? 0,
      results: raw?.results ?? {},
    };
  },
  /**
   * Merge a patch into the persisted state.
   * `opts.internal` suppresses the change event — used by cloud hydration
   * so re-applying a remote snapshot does not echo back to Supabase.
   */
  write(patch: Partial<FantasyPersistedState>, opts?: { internal?: boolean }) {
    runMutation(() => {
      const cur = this.read();
      writeJSON<FantasyPersistedState>(KEY, { ...cur, ...patch });
    }, opts);
  },
  reset(opts?: { internal?: boolean }) {
    runMutation(() => {
      writeJSON<FantasyPersistedState>(KEY, DEFAULT_STATE);
    }, opts);
  },
  getResult(gw: number): PointsViewModel | undefined {
    return this.read().results[gw];
  },
  saveResult(gw: number, vm: PointsViewModel, opts?: { internal?: boolean }) {
    runMutation(() => {
      const cur = this.read();
      this.write({ results: { ...cur.results, [gw]: vm } }, { internal: true });
    }, opts);
  },
  clearResult(gw: number, opts?: { internal?: boolean }) {
    runMutation(() => {
      const cur = this.read();
      const next = { ...cur.results };
      delete next[gw];
      this.write({ results: next }, { internal: true });
    }, opts);
  },
};
