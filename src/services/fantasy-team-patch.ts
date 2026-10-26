// The locally persisted overrides on top of the mock Fantasy team, kept apart
// from `fantasy-mock.ts` so the code that reads and writes them does not pull
// the sample data (`src/mocks/fantasy-data.ts`) into every page.

import type { FantasyTeam, FormationKey, SquadPlayer } from "@/types/fantasy";
import { STORAGE_KEYS, readJSON, writeJSON } from "@/lib/storage";

// Locally persisted overrides on top of the mock team. Kept partial so we
// only store what the user actually changed.
export interface FantasyTeamPatch {
  teamName?: string;
  managerName?: string;
  formation?: FormationKey;
  squad?: SquadPlayer[];
  bank?: number;
  freeTransfers?: number;
  pendingTransfers?: number;
}

export function loadPatch(): FantasyTeamPatch {
  return readJSON<FantasyTeamPatch>(STORAGE_KEYS.FANTASY_TEAM) ?? {};
}

export function mergeTeam(base: FantasyTeam, patch: FantasyTeamPatch): FantasyTeam {
  return {
    ...base,
    teamName: patch.teamName ?? base.teamName,
    managerName: patch.managerName ?? base.managerName,
    formation: patch.formation ?? base.formation,
    squad: patch.squad ?? base.squad,
    bank: patch.bank ?? base.bank,
    freeTransfers: patch.freeTransfers ?? base.freeTransfers,
    pendingTransfers: patch.pendingTransfers ?? base.pendingTransfers,
  };
}

export function saveTeamPatch(patch: FantasyTeamPatch): void {
  const current = loadPatch();
  writeJSON<FantasyTeamPatch>(STORAGE_KEYS.FANTASY_TEAM, { ...current, ...patch });
}
