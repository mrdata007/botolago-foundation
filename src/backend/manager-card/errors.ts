import { reportMfaStepUp } from "@/backend/auth/step-up";

/**
 * Manager Card error codes (plan section 7.5). The database answers "switched off" with
 * `{ available: false }`, never an error, so these are the real failures. A missing function
 * (`PGRST202`, a database the Manager Card migrations have not reached) reads as `unavailable`,
 * the same answer as the switch being off.
 *
 * Nothing here logs: a switched-off section must be silent on the console.
 *
 * How the screens map them:
 *   - `unavailable`  -> the status flips off (`markManagerCardOff`) and the section redirects;
 *   - `mfa_required` -> the existing step-up notice (already reported on the way through);
 *   - everything else -> the error panel with a retry.
 */
export const MANAGER_CARD_ERROR_CODES = [
  "unauthenticated",
  "mfa_required",
  "not_found",
  "unavailable",
  "invalid_request",
  "network",
  "data_unavailable",
] as const;
export type ManagerCardErrorCode = (typeof MANAGER_CARD_ERROR_CODES)[number];

export class ManagerCardError extends Error {
  constructor(
    readonly code: ManagerCardErrorCode,
    message: string,
    readonly cause?: unknown,
  ) {
    super(message, { cause });
    this.name = "ManagerCardError";
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

/** Maps a PostgREST or network failure to a code, by exact code first, then by message. */
export function mapManagerCardError(error: unknown): ManagerCardError {
  if (error instanceof ManagerCardError) return error;
  if (reportMfaStepUp(error)) {
    return new ManagerCardError("mfa_required", "Confirm the second factor to continue.", error);
  }
  const raw = error as { message?: unknown; code?: unknown } | null;
  const message = typeof raw?.message === "string" ? raw.message.trim() : "";
  const code = typeof raw?.code === "string" ? raw.code : "";
  // A database the Manager Card migrations have not reached: the same answer as the switch off.
  if (code === "PGRST202") {
    return new ManagerCardError("unavailable", "The Manager Card is not deployed.", error);
  }
  if (code === "PT401" || code === "401" || code === "42501") {
    return new ManagerCardError("unauthenticated", "Sign in to continue.", error);
  }
  if (code === "PT404" || code === "404") {
    return new ManagerCardError("not_found", "No such Manager Card.", error);
  }
  if (code === "PT400" || code === "22023") {
    return new ManagerCardError("invalid_request", message || "Invalid request.", error);
  }
  if (isNetworkFailure(error)) {
    return new ManagerCardError("network", "The network request failed.", error);
  }
  return new ManagerCardError(
    "data_unavailable",
    "The Manager Card is temporarily unavailable.",
    error,
  );
}
