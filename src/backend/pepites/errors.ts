import { reportMfaStepUp } from "@/backend/auth/step-up";

/**
 * Pépites error codes. The database answers "not open to you" with
 * `{ available: false }`, not an error, so these are the real failures: the
 * network, a signed-out write, a guest following, the account's second
 * factor, the fans' report limit, the follow cap, and anything else.
 */
export const PEPITES_ERROR_CODES = [
  "unauthenticated",
  "account_required",
  "mfa_required",
  "rate_limited",
  "follow_limit",
  "not_found",
  "invalid_request",
  "unavailable",
  "network",
  "data_unavailable",
] as const;
export type PepitesErrorCode = (typeof PEPITES_ERROR_CODES)[number];

export class PepitesError extends Error {
  constructor(
    readonly code: PepitesErrorCode,
    message: string,
    readonly cause?: unknown,
  ) {
    super(message, { cause });
    this.name = "PepitesError";
  }
}

const NETWORK_SIGNALS = [
  "failed to fetch",
  "networkerror",
  "network request failed",
  "load failed",
  "fetch failed",
];

function isNetworkFailure(error: unknown): boolean {
  if (error instanceof TypeError) return true;
  const raw = error as { message?: unknown; name?: unknown } | null;
  if (raw?.name === "AbortError") return false;
  const text = typeof raw?.message === "string" ? raw.message.toLowerCase() : "";
  return NETWORK_SIGNALS.some((signal) => text.includes(signal));
}

/** Maps a PostgREST or network failure to a code, by exact code or message. */
export function mapPepitesError(error: unknown): PepitesError {
  if (error instanceof PepitesError) return error;
  if (reportMfaStepUp(error)) {
    return new PepitesError("mfa_required", "Confirm the second factor to continue.", error);
  }
  const raw = error as { message?: unknown; code?: unknown } | null;
  const message = typeof raw?.message === "string" ? raw.message.trim() : "";
  const code = typeof raw?.code === "string" ? raw.code : "";
  // A database the Pépites migrations have not reached: the same answer as
  // Pépites being switched off.
  if (code === "PGRST202")
    return new PepitesError("unavailable", "Pépites is not deployed.", error);
  if (
    code === "PT401" ||
    message === "PEPITES_SIGN_IN_REQUIRED" ||
    message === "notification_access_denied"
  ) {
    return new PepitesError("unauthenticated", "Sign in to continue.", error);
  }
  // Following needs an account: a guest is asked to create one.
  if (message === "PEPITES_ACCOUNT_REQUIRED") {
    return new PepitesError("account_required", "Create an account to follow players.", error);
  }
  if (message === "PEPITES_FOLLOW_LIMIT") {
    return new PepitesError("follow_limit", "Too many players followed.", error);
  }
  if (message === "PEPITES_PLAYER_NOT_FOUND") {
    return new PepitesError("not_found", "No such player in Pépites.", error);
  }
  if (code === "PT429" || message === "DATA_ISSUE_RATE_LIMITED") {
    return new PepitesError("rate_limited", "Too many reports today.", error);
  }
  if (message === "PEPITES_UNAVAILABLE") return new PepitesError("unavailable", message, error);
  if (code === "22023" || code === "PT400")
    return new PepitesError("invalid_request", message, error);
  if (isNetworkFailure(error))
    return new PepitesError("network", "The network request failed.", error);
  return new PepitesError("data_unavailable", "Pépites is temporarily unavailable.", error);
}
