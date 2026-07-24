import { BackendError } from "@/backend/errors";

export const FANTASY_ERROR_CODES = [
  "fantasy_team_not_found",
  "fantasy_team_already_exists",
  "fantasy_season_closed",
  "fantasy_gameweek_locked",
  "fantasy_gameweek_not_found",
  "invalid_team_name",
  "invalid_squad",
  "invalid_formation",
  "budget_exceeded",
  "club_limit_exceeded",
  "duplicate_player",
  "player_not_eligible",
  "captain_invalid",
  "vice_captain_invalid",
  "version_conflict",
  "insufficient_free_transfers",
  "invalid_transfer",
  "chip_unavailable",
  "chip_already_used",
  "chip_conflict",
  "free_hit_snapshot_missing",
  "gameweek_not_finalizable",
  "scoring_incomplete",
  "league_not_found",
  "league_access_denied",
  "invite_code_invalid",
  "duplicate_membership",
  "ranking_unavailable",
  "idempotency_conflict",
  "data_unavailable",
] as const;
export type FantasyErrorCode = (typeof FANTASY_ERROR_CODES)[number];

export class FantasyError extends Error {
  constructor(
    readonly code: FantasyErrorCode,
    message: string,
    readonly cause?: unknown,
  ) {
    super(message, { cause });
    this.name = "FantasyError";
  }
}

export function mapFantasyError(error: unknown): FantasyError {
  if (error instanceof FantasyError) return error;
  const raw = error as { message?: string; details?: string; code?: string } | null;
  const text = `${raw?.message ?? ""} ${raw?.details ?? ""} ${raw?.code ?? ""}`.toLowerCase();
  const code = FANTASY_ERROR_CODES.find((candidate) => text.includes(candidate));
  if (code) return new FantasyError(code, publicMessage(code), error);
  return new FantasyError("data_unavailable", "Fantasy data is temporarily unavailable.", error);
}

export function fantasyErrorToBackend(error: unknown): BackendError {
  const mapped = mapFantasyError(error);
  const status = mapped.code.endsWith("not_found")
    ? 404
    : mapped.code.includes("conflict") ||
        mapped.code.includes("locked") ||
        mapped.code.includes("already")
      ? 409
      : 400;
  return new BackendError(mapped.code, mapped.message, { status, cause: error });
}

function publicMessage(code: FantasyErrorCode): string {
  switch (code) {
    case "version_conflict":
      return "Your Fantasy team changed elsewhere. Reload the latest version.";
    case "fantasy_gameweek_locked":
      return "The Fantasy deadline has passed.";
    case "budget_exceeded":
      return "This squad exceeds the available budget.";
    case "club_limit_exceeded":
      return "This squad exceeds the per-club player limit.";
    case "invite_code_invalid":
      return "The league invite code is invalid.";
    default:
      return "The Fantasy operation could not be completed.";
  }
}
