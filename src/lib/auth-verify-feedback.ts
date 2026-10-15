// The code-entry page (/auth/verify): which message a failed verification or
// resend deserves (audit QA-03, QA-04), and the guard that keeps a resend from
// being sent twice at once. The service already tells a lost connection and a
// rate limit from a wrong code; the page used to collapse them into "invalid".

import type { TranslationKey } from "@/i18n/dictionaries";
import type { AuthErrorCode } from "@/services/auth-types";

/** Only a wrong or expired code says so; a transport or server failure never blames the input. */
export function verifyFailureKey(code: AuthErrorCode | undefined): TranslationKey {
  switch (code) {
    case "otp_expired":
      return "auth.error.otp_expired";
    case "otp_invalid":
      return "auth.error.otp_invalid";
    case "network":
      return "auth.error.network";
    case "rate_limited":
      return "auth.error.rate_limited";
    default:
      return "auth.error.generic";
  }
}

/** A resend is never about the typed code: connection, rate limit, or a plain failure. */
export function resendFailureKey(code: AuthErrorCode | undefined): TranslationKey {
  switch (code) {
    case "network":
      return "auth.error.network";
    case "rate_limited":
      return "auth.error.rate_limited";
    default:
      return "auth.error.generic";
  }
}

export type SingleFlightResult<T> = { ran: true; value: T } | { ran: false };

/**
 * Wraps an async action so a second call made while one is pending does not
 * run (`{ ran: false }`). The flag clears when the first call settles, by
 * value or by rejection. A ref-like closure, not state: two clicks in the same
 * tick both see the same render.
 */
export function singleFlight<T>(action: () => Promise<T>): () => Promise<SingleFlightResult<T>> {
  let pending = false;
  return async () => {
    if (pending) return { ran: false };
    pending = true;
    try {
      return { ran: true, value: await action() };
    } finally {
      pending = false;
    }
  };
}
