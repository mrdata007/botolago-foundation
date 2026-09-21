// Pass 2 — Unified typed error model for the owned-Fantasy repository.
//
// Supersets the older FantasyCloudError codes so the same error type flows
// through both local and cloud adapters. Missing provider ids are preserved
// in aggregate so the UI (Pass 3 import prompt / conflict banner) can list
// every gap at once.

import { FantasyError } from "@/backend/fantasy/errors";
import { FantasyCloudError } from "@/services/fantasy-cloud-repo";
import { MissingIdMappingError } from "@/services/fantasy-id-map";

export type FantasyRepoErrorCode =
  | "unauthenticated"
  | "incomplete_profile"
  | "mapping_incomplete"
  | "version_conflict"
  | "permission_denied"
  | "network"
  | "validation"
  | "empty_cloud_squad"
  | "not_found"
  | "gameweek_unresolved"
  /** The gameweek deadline has passed (or the gameweek is not open) — the server refused the write. */
  | "gameweek_locked"
  /** No open Fantasy season accepts writes. */
  | "season_closed"
  | "unknown";

export interface MissingIds {
  players?: string[];
  clubs?: string[];
}

export class FantasyRepoError extends Error {
  readonly code: FantasyRepoErrorCode;
  readonly cause?: unknown;
  readonly missingIds?: MissingIds;
  constructor(
    code: FantasyRepoErrorCode,
    message?: string,
    cause?: unknown,
    missingIds?: MissingIds,
  ) {
    super(message ?? code);
    this.code = code;
    this.cause = cause;
    this.missingIds = missingIds;
  }
}

/** Convert a legacy cloud error / id-mapping error to the unified model. */
export function toRepoError(err: unknown): FantasyRepoError {
  if (err instanceof FantasyRepoError) return err;
  if (err instanceof MissingIdMappingError) {
    return new FantasyRepoError("mapping_incomplete", err.message, err, {
      players: err.missingPlayers,
      clubs: err.missingClubs,
    });
  }
  if (err instanceof FantasyCloudError) {
    const code = mapCloudCode(err.code);
    return new FantasyRepoError(code, err.message, err.cause ?? err, err.missingIds);
  }
  // Typed domain errors raised by the Supabase Fantasy repository (api.* RPCs).
  if (err instanceof FantasyError) {
    return new FantasyRepoError(mapFantasyDomainCode(err.code), err.message, err);
  }
  // PostgREST / Supabase error-like plain objects: { code, message, details }.
  const anyErr = err as { code?: string; message?: string } | null;
  const message =
    err instanceof Error ? err.message : (anyErr?.message ?? String(err ?? "unknown error"));
  const pgCode = anyErr?.code ?? "";
  if (pgCode === "40001" || /version conflict/i.test(message)) {
    return new FantasyRepoError("version_conflict", message, err);
  }
  if (pgCode === "42501" || /not authenticated/i.test(message)) {
    return new FantasyRepoError("unauthenticated", message, err);
  }
  if (pgCode === "P0002" || /not found/i.test(message)) {
    return new FantasyRepoError("not_found", message, err);
  }
  if (pgCode === "PGRST301" || /row-level security|permission denied/i.test(message)) {
    return new FantasyRepoError("permission_denied", message, err);
  }
  if (/Failed to fetch|network|NetworkError/i.test(message)) {
    return new FantasyRepoError("network", message, err);
  }
  if (
    pgCode === "23514" ||
    pgCode === "22P02" ||
    /invalid input syntax|violates check/i.test(message)
  ) {
    return new FantasyRepoError("validation", message, err);
  }
  return new FantasyRepoError("unknown", message, err);
}

function mapFantasyDomainCode(code: FantasyError["code"]): FantasyRepoErrorCode {
  switch (code) {
    case "version_conflict":
    case "idempotency_conflict":
      return "version_conflict";
    case "fantasy_gameweek_locked":
    case "fantasy_gameweek_not_found":
      return "gameweek_locked";
    case "fantasy_season_closed":
      return "season_closed";
    case "league_access_denied":
      return "permission_denied";
    case "fantasy_team_not_found":
    case "league_not_found":
      return "not_found";
    case "invalid_team_name":
    case "invalid_squad":
    case "invalid_formation":
    case "invalid_transfer":
    case "budget_exceeded":
    case "club_limit_exceeded":
    case "duplicate_player":
    case "player_not_eligible":
    case "captain_invalid":
    case "vice_captain_invalid":
    case "insufficient_free_transfers":
    case "fantasy_team_already_exists":
    case "chip_unavailable":
    case "chip_already_used":
    case "chip_conflict":
    case "invite_code_invalid":
    case "duplicate_membership":
      return "validation";
    default:
      return "unknown";
  }
}

function mapCloudCode(c: FantasyCloudError["code"]): FantasyRepoErrorCode {
  switch (c) {
    case "id_mapping_unavailable":
      return "mapping_incomplete";
    case "unauthenticated":
    case "version_conflict":
    case "permission_denied":
    case "network":
    case "validation":
    case "not_found":
      return c;
    default:
      return "unknown";
  }
}
