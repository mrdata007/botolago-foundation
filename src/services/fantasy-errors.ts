// Pass 2 — Unified typed error model for the owned-Fantasy repository.
//
// Supersets the older FantasyCloudError codes so the same error type flows
// through both local and cloud adapters. Missing provider ids are preserved
// in aggregate so the UI (Pass 3 import prompt / conflict banner) can list
// every gap at once.

import { reportMfaStepUp } from "@/backend/auth/step-up";
import { FantasyError, type FantasyErrorCode } from "@/backend/fantasy/errors";
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
  /** The server refused: the gameweek's deadline has passed. */
  | "gameweek_locked"
  /** The server refused: no Fantasy season accepts teams. */
  | "season_closed"
  /** The server refused: this manager already has a team this season. */
  | "already_exists"
  /**
   * The server refused: this session has not presented the account's second
   * factor yet (`PT403 mfa_required`). Not a Fantasy failure -- the save goes
   * through once the code is in.
   */
  | "mfa_required"
  | "unknown";

export interface MissingIds {
  players?: string[];
  clubs?: string[];
}

export class FantasyRepoError extends Error {
  readonly code: FantasyRepoErrorCode;
  readonly cause?: unknown;
  readonly missingIds?: MissingIds;
  /** The server's own refusal code when there was one (`budget_exceeded`, …). */
  readonly domainCode?: FantasyErrorCode;
  constructor(
    code: FantasyRepoErrorCode,
    message?: string,
    cause?: unknown,
    missingIds?: MissingIds,
    domainCode?: FantasyErrorCode,
  ) {
    super(message ?? code);
    this.code = code;
    this.cause = cause;
    this.missingIds = missingIds;
    this.domainCode = domainCode;
  }
}

const VALIDATION_DOMAIN_CODES: ReadonlySet<FantasyErrorCode> = new Set<FantasyErrorCode>([
  "invalid_team_name",
  "invalid_squad",
  "invalid_formation",
  "budget_exceeded",
  "club_limit_exceeded",
  "duplicate_player",
  "player_not_eligible",
  "captain_invalid",
  "vice_captain_invalid",
  "insufficient_free_transfers",
  "invalid_transfer",
  "chip_unavailable",
  "chip_already_used",
  "chip_conflict",
]);

/**
 * The repository's typed Fantasy error (the RPC's own refusal) keeps its
 * meaning. Before this mapping every such refusal -- a passed deadline
 * included -- fell through to `unknown`, and the create screen showed its
 * catch-all copy ("import failed") for a server that had answered precisely.
 */
function fromDomainError(err: FantasyError): FantasyRepoError {
  const code: FantasyRepoErrorCode =
    err.code === "fantasy_gameweek_locked"
      ? "gameweek_locked"
      : err.code === "fantasy_season_closed"
        ? "season_closed"
        : err.code === "fantasy_team_already_exists"
          ? "already_exists"
          : err.code === "version_conflict" || err.code === "idempotency_conflict"
            ? "version_conflict"
            : err.code.endsWith("_not_found")
              ? "not_found"
              : VALIDATION_DOMAIN_CODES.has(err.code)
                ? "validation"
                : err.code === "data_unavailable" && isNetworkFailure(err.cause)
                  ? "network"
                  : "unknown";
  return new FantasyRepoError(code, err.message, err, undefined, err.code);
}

function isNetworkFailure(cause: unknown): boolean {
  const message =
    cause instanceof Error
      ? cause.message
      : ((cause as { message?: unknown } | null)?.message ?? "");
  return typeof message === "string" && /Failed to fetch|NetworkError|network/i.test(message);
}

/** Convert a legacy cloud error / id-mapping error to the unified model. */
export function toRepoError(err: unknown): FantasyRepoError {
  if (err instanceof FantasyRepoError) return err;
  // The owned repository hands raw RPC errors straight here: a save refused
  // because the second factor is still owed is reported to the auth layer,
  // which takes the manager to the code (see `@/backend/auth/step-up`), and
  // keeps its own code rather than reading as "the transfers failed". Checked
  // first: wrapped by the domain or cloud mapper, it would otherwise take
  // their catch-all.
  if (reportMfaStepUp(err)) {
    return new FantasyRepoError(
      "mfa_required",
      "Confirm the second factor to continue.",
      err,
      undefined,
      err instanceof FantasyError ? err.code : undefined,
    );
  }
  if (err instanceof FantasyError) return fromDomainError(err);
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
