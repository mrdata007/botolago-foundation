import type { DeadlineCountdown } from "@/components/fpl/deadline";
import type { FantasyScreenPhase } from "@/components/fpl/useFantasyScreen";
import type { AuthStatus } from "@/services/auth-types";
import type { FantasyDataSource } from "@/services/fantasy-data-source";
import type { Gameweek } from "@/types/domain";

/**
 * Who is looking at the Fantasy hub, and so what the hub is for them.
 *
 * Audit 2026-09-25 (A16): a visitor with no team — signed out, or signed in
 * before creating one — opened the hub onto the owner's dashboard: "Mes
 * ligues" with an overall rank of "–", "no private leagues", a cup they "are
 * not qualified for", two reminder switches greyed out with no reason given,
 * and on a first visit the prize dialog on top of all of it. Nothing on the
 * screen said what the game is. Such a visitor now gets the first-time
 * proposition in place of the team card and none of the sections that cannot
 * apply to them yet; a manager with a team gets the dashboard as before.
 */
export type FantasyHubAudience =
  /** The session has not resolved: always the case on the server. */
  | "pending"
  /** Signed out, or a device guest: nothing personal can apply. */
  | "signed_out"
  /** Signed in, but the screen has not resolved (loading, failed, season closed). */
  | "signed_in"
  /** Signed in, everything resolved, and no team. */
  | "no_team"
  /** Signed in with a team: the dashboard. */
  | "owner";

/**
 * "Mes ligues" (with the cup) and the reminder switches:
 *   - `"show"`: the sections themselves, for an owner only;
 *   - `"reserve"`: neutral skeletons the sections' size while the page is
 *     still loading — an owner's sections then take their place without
 *     pushing the page down, and a visitor without a team never reads a "no
 *     private leagues" or "not qualified" that was never about them;
 *   - `"none"`: nothing.
 */
export type FantasyHubDashboard = "show" | "reserve" | "none";

export interface FantasyHubLayout {
  audience: FantasyHubAudience;
  /** The first-time proposition, and which call to action it carries. */
  intro: "signed_out" | "no_team" | null;
  dashboard: FantasyHubDashboard;
  /** The once-per-device prize dialog. */
  prizeWelcome: boolean;
}

export interface FantasyHubLayoutInput {
  authStatus: AuthStatus;
  source: FantasyDataSource;
  phase: FantasyScreenPhase;
  /** `useFantasyScreen`'s team: a snapshot with a non-empty squad. */
  hasTeam: boolean;
}

/**
 * Decides the hub's sections from the session and the screen state.
 *
 *   - The dashboard sections are an owner's, and only an owner's: a signed-in
 *     manager, a ready screen, a team. Their figures (the summary, the
 *     private leagues) are only asked for then, so anywhere else they could
 *     only say "–", "no private leagues" and "not qualified", which is the
 *     A16 screen again — and it was, for a signed-in visitor without a team,
 *     while the screen loaded.
 *   - While that is still being worked out — the session resolving (always
 *     the server render) or the screen loading — the sections' place is held
 *     with skeletons, like the rest of a loading page: most signed-in
 *     visitors own a team, and their sections arrive at the same moment as
 *     before, into space kept for them. A signed-out visitor's placeholders
 *     go when the proposition comes, in the same frame, rather than moving
 *     the page once as the session resolves and again when the screen does.
 *   - A closed season, a gameweek not yet playable or a failed request has
 *     its own panel in the team card's place, and no dashboard beside it:
 *     there is no gameweek for the sections to be about. Both reminder
 *     switches are also on the profile's notifications step.
 *   - A signed-out visitor never gets the dashboard. The proposition waits
 *     for the screen to be ready, because a closed season or a failed request
 *     has its own panel, and a "create my team" button over either would be
 *     a promise the backend refuses.
 *   - The prize dialog opens over the owner's dashboard only. Over the
 *     proposition it would be a second explanation stacked on the first, and
 *     while the team is still loading its button would offer an owner the
 *     "create a team" it offers visitors without one.
 */
export function fantasyHubLayout({
  authStatus,
  source,
  phase,
  hasTeam,
}: FantasyHubLayoutInput): FantasyHubLayout {
  if (authStatus === "loading") {
    return { audience: "pending", intro: null, dashboard: "reserve", prizeWelcome: false };
  }
  if (authStatus !== "authenticated" || source === "guest") {
    return {
      audience: "signed_out",
      intro: phase === "ready" ? "signed_out" : null,
      dashboard: phase === "loading" ? "reserve" : "none",
      prizeWelcome: false,
    };
  }
  if (phase !== "ready") {
    return {
      audience: "signed_in",
      intro: null,
      dashboard: phase === "loading" ? "reserve" : "none",
      prizeWelcome: false,
    };
  }
  if (!hasTeam) {
    return { audience: "no_team", intro: "no_team", dashboard: "none", prizeWelcome: false };
  }
  return { audience: "owner", intro: null, dashboard: "show", prizeWelcome: true };
}

/**
 * The gameweek a team created now would start in, and the deadline to make
 * it: the backend's enrolment gameweek. `null` when registration is closed
 * (`enrolment === null`) or no gameweek is known. Mock mode carries no
 * enrolment, so the current gameweek stands in for it, as on the create page.
 *
 * Whether that deadline is still ahead is a question for the clock:
 * `joinDeadlineToShow`.
 */
export function joinTarget(
  gameweek: Pick<Gameweek, "number" | "deadline" | "enrolment"> | null,
): { number: number; deadline: string } | null {
  if (!gameweek || gameweek.enrolment === null) return null;
  if (gameweek.enrolment) {
    return { number: gameweek.enrolment.number, deadline: gameweek.enrolment.deadline };
  }
  return { number: gameweek.number, deadline: gameweek.deadline };
}

/**
 * The join deadline to print, or `null` once the clock has passed it.
 * `countdown` is `useDeadlineCountdown`'s answer: `null` on the server and in
 * the hydrating frame, when the line shows — the backend named this gameweek
 * as the one still taking new teams — and passed from the first tick after
 * the deadline, when a "create it before" would be a date already gone. The
 * next refetch of the gameweek names the next one to join.
 */
export function joinDeadlineToShow<T extends { deadline: string }>(
  joinBy: T | null,
  countdown: Pick<DeadlineCountdown, "passed"> | null,
): T | null {
  return joinBy && !countdown?.passed ? joinBy : null;
}
