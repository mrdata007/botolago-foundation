// Persistent Fantasy state store: chips, current gameweek, transfer hit,
// pre-Free-Hit snapshot, and last-computed gameweek results. Persists via
// namespaced localStorage so a page refresh preserves everything.

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

export const DEFAULT_STATE: FantasyPersistedState = {
  chips: DEFAULT_CHIPS,
  currentGameweek: 14,
  transferHitPoints: 0,
  results: {},
};

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
  write(patch: Partial<FantasyPersistedState>) {
    const cur = this.read();
    writeJSON<FantasyPersistedState>(KEY, { ...cur, ...patch });
  },
  reset() {
    writeJSON<FantasyPersistedState>(KEY, DEFAULT_STATE);
  },
  getResult(gw: number): PointsViewModel | undefined {
    return this.read().results[gw];
  },
  saveResult(gw: number, vm: PointsViewModel) {
    const cur = this.read();
    this.write({ results: { ...cur.results, [gw]: vm } });
  },
  clearResult(gw: number) {
    const cur = this.read();
    const next = { ...cur.results };
    delete next[gw];
    this.write({ results: next });
  },
};
