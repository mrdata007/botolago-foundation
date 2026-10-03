import type { FantasyAvailabilityView } from "@/services/use-fantasy-availability";
import type { AuthStatus } from "@/services/auth-types";

/** Where the builder lives: the landing page's one primary destination. */
export const LANDING_CREATE_PATH = "/fantasy/create";
/** An owner's way back to the team they already saved. */
export const LANDING_TEAM_PATH = "/fantasy/team";
/** The Fantasy hub, which explains a closed or not-yet-open season itself. */
export const LANDING_HUB_PATH = "/fantasy";

/**
 * The landing page's primary action, decided from the authoritative state
 * only — the session, the season's availability and, for a signed-in reader,
 * whether the account already owns a team:
 *
 *   - `pending`: something that decides the button is still loading. The
 *     button keeps its place without a label, so a manager never sees
 *     "Créer mon équipe" turn into "Voir mon équipe".
 *   - `create`: the builder. A visitor without an account composes first; the
 *     builder asks for a free account when the team is saved, with itself as
 *     `next`, and keeps the draft on the device meanwhile.
 *   - `team`: the account already has a team.
 *   - `discover`: no team can be created now (season closed, no gameweek yet,
 *     or this gameweek's entries closed). The hub says why in words.
 *
 * A failed availability probe does not block the way in: the builder runs
 * its own checks and says "closed" itself if that is the truth.
 */
export type LandingCta =
  | { kind: "pending" }
  | { kind: "create"; to: typeof LANDING_CREATE_PATH }
  | { kind: "team"; to: typeof LANDING_TEAM_PATH }
  | { kind: "discover"; to: typeof LANDING_HUB_PATH };

export interface LandingCtaInput {
  authStatus: AuthStatus;
  availability: FantasyAvailabilityView;
  /**
   * For a signed-in reader: whether the account has a team. `undefined`
   * while the summary is loading (or not asked for), `null` on a failure.
   */
  hasTeam: boolean | null | undefined;
}

export function landingCta({ authStatus, availability, hasTeam }: LandingCtaInput): LandingCta {
  if (authStatus === "loading") return { kind: "pending" };
  if (authStatus === "authenticated") {
    if (hasTeam === undefined) return { kind: "pending" };
    if (hasTeam === true) return { kind: "team", to: LANDING_TEAM_PATH };
  }
  if (availability.kind === "loading") return { kind: "pending" };
  if (availability.kind === "season_closed" || availability.kind === "awaiting_gameweek") {
    return { kind: "discover", to: LANDING_HUB_PATH };
  }
  if (availability.kind === "ready" && !availability.canCreate) {
    return { kind: "discover", to: LANDING_HUB_PATH };
  }
  return { kind: "create", to: LANDING_CREATE_PATH };
}
