import { reportMfaStepUp } from "@/backend/auth/step-up";

/**
 * Manager Card error codes: the `message` of every exception the Manager Card
 * reads raise, plus the ones the app adds (a network failure, anything else).
 *
 * Mapped by EXACT equality with the raised message, never by substring.
 * `authentication_required` (PT401) reaches the screens as `unauthenticated`.
 */
export const MANAGER_CARD_ERROR_CODES = [
  "unauthenticated",
  /** The read switch is off (PT403 `manager_card_off`), or the functions are not deployed yet. */
  "manager_card_off",
  "validation_failed",
  /**
   * This session has not presented the account's second factor yet
   * (`PT403 mfa_required`), recognised by `isMfaStepUpError`.
   */
  "mfa_required",
  "network",
  "data_unavailable",
] as const;
export type ManagerCardErrorCode = (typeof MANAGER_CARD_ERROR_CODES)[number];

/** Raised messages that are their own code. */
const RAISED_CODES: ReadonlySet<string> = new Set(["manager_card_off", "validation_failed"]);

export class ManagerCardError extends Error {
  constructor(
    readonly code: ManagerCardErrorCode,
    message: string,
    readonly cause?: unknown,
  ) {
    super(message, { cause });
    this.name = "ManagerCardError";
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

export function mapManagerCardError(error: unknown): ManagerCardError {
  if (error instanceof ManagerCardError) return error;
  if (reportMfaStepUp(error))
    return new ManagerCardError("mfa_required", "Confirm the second factor to continue.", error);
  const raw = error as { message?: unknown; code?: unknown } | null;
  const message = typeof raw?.message === "string" ? raw.message.trim() : "";
  // PostgREST's "function not found": a database the Manager Card migrations
  // have not reached yet. The same answer as the switch being off.
  if (raw?.code === "PGRST202")
    return new ManagerCardError("manager_card_off", "The Manager Card is not deployed.", error);
  if (message === "authentication_required")
    return new ManagerCardError("unauthenticated", "Sign in to see Manager Cards.", error);
  if (RAISED_CODES.has(message))
    return new ManagerCardError(message as ManagerCardErrorCode, message, error);
  if (isNetworkFailure(error))
    return new ManagerCardError("network", "The network request failed.", error);
  return new ManagerCardError(
    "data_unavailable",
    "The Manager Card is temporarily unavailable.",
    error,
  );
}
