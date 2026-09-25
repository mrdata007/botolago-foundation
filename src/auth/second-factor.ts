// The second-factor gate's decisions, kept free of React so they can be tested
// as plain functions. `SecondFactorGate.tsx` and the auth routes apply them.
//
// Before 2026-09-25 the one-time code was a navigation step and nothing more:
// the login page sent an enrolled account to the challenge, but the session
// that password had created was already "authenticated" everywhere else, so
// leaving the challenge page -- or failing the assurance lookup, or arriving
// through the e-mail/OAuth callback -- reached the whole app with the password
// alone. The session now carries its own second-factor state (`AuthStatus`),
// and these rules decide what each screen does with it.

import {
  readSessionAssurance,
  type MfaAuthClient,
  type SessionAssurance,
} from "@/backend/auth/mfa";
import { sanitizeAuthCallbackNext } from "@/lib/auth-callback";
import type { AuthSession, AuthStatus, AuthUser } from "@/services/auth-types";

export const MFA_CHALLENGE_PATH = "/auth/mfa-challenge";

/**
 * The session to publish for a signed-in Supabase user, given how far its
 * second factor has got. Only a complete sign-in carries the user: in the two
 * owing states every screen, every owner-scoped query key and every write sees
 * nobody, exactly as if the visitor were signed out. The account id rides
 * along separately (`pendingAccountId`) so that owing the code is not mistaken
 * for leaving the account.
 */
export function sessionForAssurance(user: AuthUser, assurance: SessionAssurance): AuthSession {
  switch (assurance) {
    case "complete":
      return { user, status: "authenticated" };
    case "second_factor_pending":
      return { user: null, status: "mfa_required", pendingAccountId: user.id };
    default:
      return { user: null, status: "mfa_unconfirmed", pendingAccountId: user.id };
  }
}

/** A session exists but may not be used until its second factor is settled. */
export function isSecondFactorOwed(status: AuthStatus | undefined): boolean {
  return status === "mfa_required" || status === "mfa_unconfirmed";
}

/**
 * The session is settled, and is a complete sign-in or nobody's. A read that
 * answers for whoever's token the request carries -- a board's "your rank" --
 * waits for this. While `loading`, that token may be an account still being
 * read (or, mid-switch, the next one); while the code is owed, it is an
 * account the app does not count as signed in. Either way the answer would be
 * that account's, shown under a key the page keeps for visitors, before the
 * second-factor gate moves the reader on.
 */
export function isSessionSettled(status: AuthStatus | undefined): boolean {
  return status === "authenticated" || status === "anonymous" || status === "guest";
}

/**
 * Whose data the device is holding on to: the signed-in account, or the one
 * that still owes its code. Not a permission -- the second case may not read
 * or write anything -- only the answer to "has the account changed?".
 */
export function sessionAccountId(session: AuthSession): string | null {
  if (session.user) return session.user.id;
  return isSecondFactorOwed(session.status) ? (session.pendingAccountId ?? null) : null;
}

export type RequireAuthStep = "run" | "challenge" | "prompt";

/**
 * What `requireAuth` does with an action: run it for a complete sign-in, send
 * a session that owes its code to the challenge (it has a password session
 * already, so the sign-in prompt would be the wrong question), and ask
 * everyone else to sign in.
 */
export function requireAuthStep(status: AuthStatus | undefined): RequireAuthStep {
  if (status === "authenticated") return "run";
  return isSecondFactorOwed(status) ? "challenge" : "prompt";
}

export type SecondFactorStep = "proceed" | "challenge" | "retry";

/**
 * What a screen that has just established a session does next:
 * `proceed` into the app, go to the `challenge`, or show the `retry` panel
 * because the assurance lookup failed. `null` when there is no session to act
 * on (an OAuth sign-in that is still redirecting, a callback with nothing to
 * exchange); the screen keeps its existing behaviour for that case.
 *
 * A failed lookup is never `proceed`. That was the bypass.
 */
export function secondFactorStep(status: AuthStatus | undefined): SecondFactorStep | null {
  switch (status) {
    case "authenticated":
      return "proceed";
    case "mfa_required":
      return "challenge";
    case "mfa_unconfirmed":
      return "retry";
    default:
      return null;
  }
}

/**
 * Pages a session owing its code may stay on: the challenge itself, the
 * screens for signing in again or as someone else, the legal texts, and the
 * e-mail unsubscribe link (which works from its own token, signed in or not).
 *
 * `/admin` is excluded from this gate on purpose. Staff screens enforce MFA on
 * the server and show their own step-up state; this gate must not change or
 * pre-empt that flow.
 */
const OPEN_WHILE_OWED = [
  MFA_CHALLENGE_PATH,
  "/auth/login",
  "/auth/register",
  "/auth/verify",
  "/auth/callback",
  "/auth/forgot-password",
  "/admin",
  "/privacy",
  "/terms",
  "/prizes/terms",
  "/unsubscribe",
] as const;

function isUnder(pathname: string, base: string): boolean {
  return pathname === base || pathname.startsWith(`${base}/`);
}

export function isOpenWhileSecondFactorOwed(pathname: string): boolean {
  return OPEN_WHILE_OWED.some((base) => isUnder(pathname, base));
}

/**
 * The challenge's search for a reader who was on `pathname + searchStr`: the
 * same-site destination to return to once the code is in, through the shared
 * sanitiser like every other `next`. The home page needs no `next`.
 */
export function challengeSearch(pathname: string, searchStr = ""): { next?: string } {
  const next = sanitizeAuthCallbackNext(`${pathname}${searchStr}`);
  return next === "/" ? {} : { next };
}

export interface ChallengeRedirect {
  to: typeof MFA_CHALLENGE_PATH;
  search: { next?: string };
}

/**
 * Where the gate sends a reader, or `null` to leave them where they are.
 *
 * Every page that is not in `OPEN_WHILE_OWED` counts as protected: the app has
 * no public page that is safe to show "signed in" while the code is owed, and a
 * page that only LOOKS public (Home, News, a club) still renders the account's
 * follows, Fantasy card and Pronostics.
 */
export function secondFactorRedirect(
  status: AuthStatus | undefined,
  location: { pathname: string; searchStr?: string },
): ChallengeRedirect | null {
  if (!isSecondFactorOwed(status)) return null;
  if (isOpenWhileSecondFactorOwed(location.pathname)) return null;
  return {
    to: MFA_CHALLENGE_PATH,
    search: challengeSearch(location.pathname, location.searchStr),
  };
}

/**
 * The same barrier for a route guard that runs before anything renders (a
 * `beforeLoad`), asked of Supabase directly: where to send a session that owes
 * its code, or `null` when nothing is owed.
 *
 * `SecondFactorGate` cannot stand in for this. It is an effect, it waits for
 * the provider's session, and a loader that hands the reader to another site
 * (the OAuth consent page, for a client already approved) has finished long
 * before any effect runs. A failed lookup counts as owed: fail closed, and the
 * challenge page offers the retry.
 */
export async function secondFactorGuard(
  mfa: Pick<MfaAuthClient, "getAuthenticatorAssuranceLevel">,
  location: { pathname: string; searchStr?: string },
): Promise<ChallengeRedirect | null> {
  if ((await readSessionAssurance(mfa)) === "complete") return null;
  return {
    to: MFA_CHALLENGE_PATH,
    search: challengeSearch(location.pathname, location.searchStr),
  };
}
