// UX-004 — why a join did not go through, said truthfully.
//
// Every failure used to read "Code invalide" (and, for a public league, "Une
// erreur est survenue"), including a dropped connection and a failure to
// refresh the league list after the join had already succeeded. Only the
// server's own refusal of the code is the code's fault.

import { mapFantasyError } from "@/backend/fantasy/errors";

export type JoinFailure =
  /** The server refused the code (`invite_code_invalid`). */
  | "invalid_code"
  /** The request never got an answer: the connection failed. */
  | "network"
  /** Anything else: the service did not complete the request. The code was not refused. */
  | "unavailable";

const NETWORK_FAILURE = /failed to fetch|networkerror|network request failed|load failed|aborted/i;

function textOf(value: unknown): string {
  if (value instanceof Error) return value.message;
  const message = (value as { message?: unknown } | null)?.message;
  return typeof message === "string" ? message : "";
}

/**
 * Classifies a failed join. The caller handles the second-factor refusal
 * (`isMfaStepUpError`) before this: a code owed is neither of these.
 */
export function joinFailureKind(error: unknown): JoinFailure {
  const mapped = mapFantasyError(error);
  if (mapped.code === "invite_code_invalid") return "invalid_code";
  const reason = `${textOf(mapped.cause)} ${textOf(error)}`;
  const offline = typeof navigator !== "undefined" && navigator.onLine === false;
  return offline || NETWORK_FAILURE.test(reason) ? "network" : "unavailable";
}
