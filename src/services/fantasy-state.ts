// Persistent Fantasy state store: chips, current gameweek, transfer hit,
// pre-Free-Hit snapshot, and last-computed gameweek result. Persists via
// namespaced localStorage so a page refresh preserves everything.

import { readJSON, writeJSON } from "@/lib/storage";
import { DEFAULT_CHIPS, type ChipsState } from "@/lib/fantasy-engine";

export interface FantasyPersistedState {
  chips: ChipsState;
  currentGameweek: number;
  transferHitPoints: number;
}

const KEY = "fantasy.state";

export const DEFAULT_STATE: FantasyPersistedState = {
  chips: DEFAULT_CHIPS,
  currentGameweek: 14,
  transferHitPoints: 0,
};

export const fantasyStateStore = {
  read(): FantasyPersistedState {
    const raw = readJSON<Partial<FantasyPersistedState>>(KEY);
    return {
      chips: raw?.chips ?? DEFAULT_CHIPS,
      currentGameweek: raw?.currentGameweek ?? DEFAULT_STATE.currentGameweek,
      transferHitPoints: raw?.transferHitPoints ?? 0,
    };
  },
  write(patch: Partial<FantasyPersistedState>) {
    const cur = this.read();
    writeJSON<FantasyPersistedState>(KEY, { ...cur, ...patch });
  },
  reset() {
    writeJSON<FantasyPersistedState>(KEY, DEFAULT_STATE);
  },
};
