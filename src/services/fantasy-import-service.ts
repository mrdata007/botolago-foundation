// Imports an authenticated user's valid local Fantasy squad into the
// currently active V2 cloud gameweek. The cloud hub identity is injected by
// the caller; this module never resolves legacy public gameweek tables or
// carries prior-season lifecycle results into a new season.

import type { FantasyPlayer } from "@/types/fantasy";
import { validateTeam } from "@/lib/team-validation";
import { FantasyRepoError, toRepoError } from "@/services/fantasy-errors";
import type {
  FantasyOwnedRepository,
  FantasySnapshot,
  SaveOwnedTeamInput,
} from "@/services/fantasy-owned-repository";

export interface ImportServiceDeps {
  localRepo: Pick<FantasyOwnedRepository, "loadSnapshot">;
  cloudRepo: Pick<FantasyOwnedRepository, "saveTeam">;
  loadPlayers: () => Promise<FantasyPlayer[]>;
  /** Authoritative mutable gameweek from the V2 Fantasy hub. */
  currentGameweekId: string | null;
  currentGameweek: number;
  /** Localized default team name; used when local metadata is empty. */
  defaultTeamName: string;
  /** Expected cloud version (0 for empty cloud). */
  cloudExpectedVersion: number;
}

/**
 * Assemble the SaveOwnedTeamInput without hitting the cloud. Extracted so
 * tests can assert the exact payload passed to `saveTeam`.
 */
export async function prepareImportPayload(deps: ImportServiceDeps): Promise<SaveOwnedTeamInput> {
  const localSnapshot = await deps.localRepo.loadSnapshot();
  const team = localSnapshot.team;
  const players = await deps.loadPlayers();

  const validation = validateTeam(team.squad, team.formation, players);
  if (!validation.ok) {
    throw new FantasyRepoError("validation", `import: ${validation.error}`);
  }
  if (!deps.currentGameweekId || !Number.isInteger(deps.currentGameweek) || deps.currentGameweek < 1) {
    throw new FantasyRepoError("gameweek_unresolved", "No active V2 gameweek is available");
  }

  return {
    teamName: (team.teamName ?? "").trim().length > 0 ? team.teamName : deps.defaultTeamName,
    managerName: (team.managerName ?? "").trim().length > 0 ? team.managerName : null,
    formation: team.formation,
    bank: team.bank,
    freeTransfers: team.freeTransfers,
    pendingTransfers: team.pendingTransfers,
    squad: team.squad,
    purchasePrices: localSnapshot.purchasePrices,
    expectedVersion: deps.cloudExpectedVersion,
    currentGameweekId: deps.currentGameweekId,
    lifecycle: {
      chips: { active: null, used: [] },
      currentGameweek: deps.currentGameweek,
      transferHitPoints: 0,
      results: {},
    },
  };
}

/**
 * Full import pipeline. Never sets the import-decision marker — the caller
 * is responsible for that on success.
 */
export async function importLocalTeamToCloud(deps: ImportServiceDeps): Promise<FantasySnapshot> {
  const input = await prepareImportPayload(deps);
  try {
    return await deps.cloudRepo.saveTeam(input);
  } catch (err) {
    throw toRepoError(err);
  }
}
