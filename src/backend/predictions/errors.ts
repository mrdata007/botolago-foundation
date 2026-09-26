import { reportMfaStepUp } from "@/backend/auth/step-up";

/**
 * Pronostics error codes: the `message` of every exception the Pronostics
 * functions raise, plus the two the app adds (a network failure, anything
 * else).
 *
 * Mapped by EXACT equality with the raised message, never by substring. The
 * Fantasy mapper searches the whole error text for a known code, which is how
 * it has lost codes before (a message containing two known words matches the
 * first one listed). The screens translate each code to its own sentence.
 */
export const PREDICTIONS_ERROR_CODES = [
  "predictions_unauthenticated",
  "predictions_unavailable",
  "account_banned",
  "predictions_invalid_payload",
  "validation_failed",
  "predictions_round_not_found",
  "invite_code_invalid",
  "league_limit_reached",
  "league_full",
  "league_membership_not_found",
  "league_owner_cannot_leave",
  "league_access_denied",
  "league_create_limit_reached",
  "predictions_leagues_unavailable",
  "match_vote_unavailable",
  "match_vote_closed",
  /**
   * This session has not presented the account's second factor yet. Raised
   * by the database's shared account guard (`PT403 mfa_required`), and
   * recognised by that exact pair (`isMfaStepUpError`), not by the message.
   */
  "mfa_required",
  "network",
  "data_unavailable",
] as const;
export type PredictionsErrorCode = (typeof PREDICTIONS_ERROR_CODES)[number];

/** Codes a Pronostics function raises itself, matched by message. */
const RAISED_CODES: ReadonlySet<string> = new Set(
  PREDICTIONS_ERROR_CODES.filter(
    (code) => code !== "network" && code !== "data_unavailable" && code !== "mfa_required",
  ),
);

export class PredictionsError extends Error {
  constructor(
    readonly code: PredictionsErrorCode,
    message: string,
    readonly cause?: unknown,
  ) {
    super(message, { cause });
    this.name = "PredictionsError";
  }

  /** Worth trying again as is: the request never reached the database. */
  get retryable(): boolean {
    return this.code === "network";
  }
}

const NETWORK_SIGNALS = [
  "failed to fetch",
  "networkerror",
  "network request failed",
  "load failed",
  "fetch failed",
  "the internet connection appears to be offline",
];

function isNetworkFailure(error: unknown): boolean {
  if (error instanceof TypeError) return true;
  const raw = error as { message?: unknown; name?: unknown } | null;
  if (raw?.name === "AbortError") return false;
  const text = typeof raw?.message === "string" ? raw.message.toLowerCase() : "";
  return NETWORK_SIGNALS.some((signal) => text.includes(signal));
}

export function mapPredictionsError(error: unknown): PredictionsError {
  if (error instanceof PredictionsError) return error;
  // A pick refused because the second factor is still owed: the auth layer
  // takes the reader to the code (see `@/backend/auth/step-up`), and the
  // screens say so instead of "Pronostics indisponibles".
  if (reportMfaStepUp(error))
    return new PredictionsError("mfa_required", "Confirm the second factor to continue.", error);
  const raw = error as { message?: unknown; code?: unknown } | null;
  const message = typeof raw?.message === "string" ? raw.message.trim() : "";
  // PostgREST's "function not found": a database the Pronostics migrations
  // have not reached yet. The same answer as the switch being off.
  if (raw?.code === "PGRST202")
    return new PredictionsError("predictions_unavailable", "Pronostics are not deployed.", error);
  if (RAISED_CODES.has(message))
    return new PredictionsError(message as PredictionsErrorCode, message, error);
  if (isNetworkFailure(error))
    return new PredictionsError("network", "The network request failed.", error);
  return new PredictionsError("data_unavailable", "Pronostics are temporarily unavailable.", error);
}
