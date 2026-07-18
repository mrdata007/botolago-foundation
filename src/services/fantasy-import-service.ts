// Pass 3.2-H3 — Testable Fantasy import service.
//
// Imports the authenticated user's local Fantasy snapshot into their empty
// cloud team. All dependencies are injected so tests never touch Supabase.
//
// Contract:
//   1. Source of truth = `deps.localRepo.loadSnapshot()`.
//   2. Validates exactly 15 players, legal formation, captain/vice rules via
//      the existing `validateTeam` helper.
//   3. Resolves `snapshot.lifecycle.currentGameweek` (number) to a live UUID
//      via the injected gameweek index for `deps.season`. Never passes
//      `null` as `currentGameweekId` when creating the cloud team.
//   4. Calls `deps.cloudRepo.saveTeam(...)` exactly once with local team
//      metadata, formation, bank, transfers, squad, lifecycle, purchase
//      prices, expected version (usually 0 for empty cloud) and resolved GW
//      UUID.
//   5. Aggregate mapping errors surface `MissingIdMappingError` via
//      `toRepoError` (already handled by the cloud repo path) — this service
//      re-throws unchanged so callers can display every missing id.
//   6. Never touches the import-decision marker or any local store — the
//      caller sets the marker only after a successful outcome.
//
// The service returns the authoritative cloud snapshot on success or throws
// a typed FantasyRepoError.

import type { FantasyPlayer } from "@/types/fantasy";
import { validateTeam } from "@/lib/team-validation";
import { FantasyRepoError, toRepoError } from "@/services/fantasy-errors";
import {
  resolveGameweekId,
  type GameweekIndex,
} from "@/services/fantasy-gameweek-resolver";
import type {
  FantasyOwnedRepository,
  FantasySnapshot,
  SaveOwnedTeamInput,
} from "@/services/fantasy-owned-repository";

export interface ImportServiceDeps {
  localRepo: Pick<FantasyOwnedRepository, "loadSnapshot">;
  cloudRepo: Pick<FantasyOwnedRepository, "saveTeam">;
  loadPlayers: () => Promise<FantasyPlayer[]>;
  loadGameweekIndex: () => Promise<GameweekIndex>;
  /** Season passed to the resolver (e.g. DEFAULT_SEASON). */
  season: string;
  /** Localized default team name; used when local metadata is empty. */
  defaultTeamName: string;
  /** Expected cloud version (0 for empty cloud). */
  cloudExpectedVersion: number;
}

/**
 * Assemble the SaveOwnedTeamInput without hitting the cloud. Extracted so
 * tests can assert the exact payload passed to `saveTeam`.
 */
export async function prepareImportPayload(
  deps: ImportServiceDeps,
): Promise<SaveOwnedTeamInput> {
  const localSnapshot = await deps.localRepo.loadSnapshot();
  const team = localSnapshot.team;
  const players = await deps.loadPlayers();

  // Validation — surface as typed error.
  const v = validateTeam(team.squad, team.formation, players);
  if (!v.ok) {
    throw new FantasyRepoError(
      "validation",
      `import: ${v.error}`,
    );
  }

  // Resolve the current GW number → live UUID. Never guess.
  const gwNumber = localSnapshot.lifecycle.currentGameweek;
  const index = await deps.loadGameweekIndex();
  const currentGameweekId = resolveGameweekId(index, {
    number: gwNumber,
    season: deps.season,
  });

  return {
    teamName:
      (team.teamName ?? "").trim().length > 0
        ? team.teamName
        : deps.defaultTeamName,
    managerName:
      (team.managerName ?? "").trim().length > 0 ? team.managerName : null,
    formation: team.formation,
    bank: team.bank,
    freeTransfers: team.freeTransfers,
    pendingTransfers: team.pendingTransfers,
    squad: team.squad,
    purchasePrices: localSnapshot.purchasePrices,
    expectedVersion: deps.cloudExpectedVersion,
    currentGameweekId,
    lifecycle: localSnapshot.lifecycle,
  };
}

/**
 * Full import pipeline. Never sets the import-decision marker — the caller
 * is responsible for that on success.
 */
export async function importLocalTeamToCloud(
  deps: ImportServiceDeps,
): Promise<FantasySnapshot> {
  const input = await prepareImportPayload(deps);
  try {
    return await deps.cloudRepo.saveTeam(input);
  } catch (err) {
    // Ensure everything downstream sees a typed FantasyRepoError.
    throw toRepoError(err);
  }
}
