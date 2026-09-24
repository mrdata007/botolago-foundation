import type { PostgrestError } from "@supabase/supabase-js";
import { BackendError } from "@/backend/errors";

export const FOOTBALL_ERROR_CODES = [
  "provider_unavailable",
  "provider_rate_limited",
  "invalid_provider_payload",
  "mapping_not_found",
  "mapping_collision",
  "stale_update",
  "fixture_not_found",
  "team_not_found",
  "competition_not_supported",
  "invalid_fixture_state",
  "partial_sync_failure",
  "ingestion_conflict",
  "data_unavailable",
] as const;
export type FootballErrorCode = (typeof FOOTBALL_ERROR_CODES)[number];

const STATUS: Record<FootballErrorCode, number> = {
  provider_unavailable: 503,
  provider_rate_limited: 429,
  invalid_provider_payload: 422,
  mapping_not_found: 404,
  mapping_collision: 409,
  stale_update: 409,
  fixture_not_found: 404,
  team_not_found: 404,
  competition_not_supported: 422,
  invalid_fixture_state: 409,
  partial_sync_failure: 503,
  ingestion_conflict: 409,
  data_unavailable: 503,
};

const RETRYABLE = new Set<FootballErrorCode>([
  "provider_unavailable",
  "provider_rate_limited",
  "partial_sync_failure",
  "data_unavailable",
]);

export class FootballError extends BackendError {
  declare readonly code: FootballErrorCode;

  constructor(code: FootballErrorCode, message: string, cause?: unknown) {
    super(code, message, {
      status: STATUS[code],
      retryable: RETRYABLE.has(code),
      cause,
    });
    this.name = "FootballError";
    this.code = code;
  }
}

const DATABASE_CODES: Record<string, FootballErrorCode> = {
  FIXTURE_NOT_FOUND: "fixture_not_found",
  TEAM_NOT_FOUND: "team_not_found",
  COMPETITION_NOT_FOUND: "competition_not_supported",
  MAPPING_NOT_FOUND: "mapping_not_found",
  MAPPING_COLLISION: "mapping_collision",
  STALE_UPDATE: "stale_update",
  INVALID_FIXTURE_STATE: "invalid_fixture_state",
  INVALID_PROVIDER_PAYLOAD: "invalid_provider_payload",
};

export function mapFootballError(error: PostgrestError | Error | unknown): FootballError {
  if (error instanceof FootballError) return error;
  const candidate = error as { message?: string; code?: string } | null;
  const message = String(candidate?.message ?? "").toUpperCase();
  for (const [marker, code] of Object.entries(DATABASE_CODES)) {
    if (message.includes(marker)) return new FootballError(code, publicMessage(code), error);
  }
  if (candidate?.code === "PGRST301" || candidate?.code === "PGRST302") {
    return new FootballError("data_unavailable", publicMessage("data_unavailable"), error);
  }
  return new FootballError("data_unavailable", publicMessage("data_unavailable"), error);
}

function publicMessage(code: FootballErrorCode): string {
  const messages: Record<FootballErrorCode, string> = {
    provider_unavailable: "The football provider is temporarily unavailable.",
    provider_rate_limited: "The football provider rate limit was reached.",
    invalid_provider_payload: "The football provider returned invalid data.",
    mapping_not_found: "A canonical football identity could not be resolved.",
    mapping_collision: "A provider identity conflicts with canonical football data.",
    stale_update: "An older football update was rejected.",
    fixture_not_found: "The match was not found.",
    team_not_found: "The team was not found.",
    competition_not_supported: "The competition is not supported.",
    invalid_fixture_state: "The requested match state transition is invalid.",
    partial_sync_failure: "The football sync completed only partially.",
    ingestion_conflict: "The football sync conflicted with another update.",
    data_unavailable: "Football data is temporarily unavailable.",
  };
  return messages[code];
}
