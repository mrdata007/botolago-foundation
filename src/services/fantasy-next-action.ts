import type { FantasyAvailabilityView } from "@/services/use-fantasy-availability";
import type { TranslationKey } from "@/i18n/dictionaries";
import type { Gameweek } from "@/types/domain";

/**
 * The one "what can I do next?" answer every Fantasy entry point shows: the
 * home card, the landing page, the hub and the rankings line.
 *
 * It is a presentation model over three separate inputs, and keeps them
 * separate on purpose:
 *
 *   - `availability` — can a new team be created right now (the same probe
 *     `/fantasy/create` gates on, so a "create" action never leads into a
 *     closed builder);
 *   - `hasTeam` — whether this account owns a team;
 *   - `gameweek` — the current round's status and the next round's
 *     enrolment, for an owner.
 *
 * A finalized current round does not mean enrolment is closed, and a failed
 * request is never turned into "closed": it is `retry`.
 *
 * Its words come from `nextActionLabel`.
 */
export type FantasyNextActionKind =
  | "pending"
  | "retry"
  | "create"
  | "explore"
  | "prepare"
  | "view_team"
  | "follow_points"
  | "view_result"
  | "prepare_next"
  | "results";

export type FantasyNextActionPath =
  | "/fantasy/create"
  | "/fantasy/players"
  | "/fantasy/team"
  | "/fantasy/points";

export type FantasyNextAction =
  | { kind: "pending" }
  | { kind: "retry" }
  | {
      kind: Exclude<FantasyNextActionKind, "pending" | "retry">;
      to: FantasyNextActionPath;
      /**
       * The deadline the action is about, when one is known: the enrolment
       * deadline for `create`, the current one for `prepare`, the next
       * round's for `prepare_next`. Never invented.
       */
      deadline: { number: number; at: string } | null;
    };

export interface FantasyNextActionInput {
  availability: FantasyAvailabilityView;
  /**
   * Whether the account owns a team: `false` for a guest or an account with
   * none, `undefined` while loading, `null` when the request failed.
   */
  hasTeam: boolean | null | undefined;
  /** The current gameweek, for an owner. `null` when there is none. */
  gameweek?: Pick<Gameweek, "number" | "deadline" | "status" | "pointsState" | "enrolment"> | null;
  now: number;
}

const future = (iso: string | undefined, now: number) => iso !== undefined && Date.parse(iso) > now;

export function fantasyNextAction({
  availability,
  hasTeam,
  gameweek,
  now,
}: FantasyNextActionInput): FantasyNextAction {
  if (hasTeam === undefined) return { kind: "pending" };
  if (hasTeam === null) return { kind: "retry" };

  if (!hasTeam) {
    if (availability.kind === "loading") return { kind: "pending" };
    if (availability.kind === "error") return { kind: "retry" };
    if (availability.kind === "ready" && availability.canCreate) {
      const enrolment = gameweek?.enrolment;
      return {
        kind: "create",
        to: "/fantasy/create",
        deadline:
          enrolment && future(enrolment.deadline, now)
            ? { number: enrolment.number, at: enrolment.deadline }
            : null,
      };
    }
    // Season closed, no gameweek yet, or this round's entries are closed:
    // research stays open to everyone.
    return { kind: "explore", to: "/fantasy/players", deadline: null };
  }

  // An owner. A closed season leaves the results to look back on.
  if (availability.kind === "season_closed") {
    return { kind: "results", to: "/fantasy/points", deadline: null };
  }
  if (!gameweek) return { kind: "view_team", to: "/fantasy/team", deadline: null };

  switch (gameweek.status) {
    case "live":
    case "provisional":
    case "finalizing":
      return { kind: "follow_points", to: "/fantasy/points", deadline: null };
    case "finalized":
    case "corrected": {
      const next = gameweek.enrolment;
      if (next && next.number !== gameweek.number && future(next.deadline, now)) {
        return {
          kind: "prepare_next",
          to: "/fantasy/team",
          deadline: { number: next.number, at: next.deadline },
        };
      }
      return { kind: "view_result", to: "/fantasy/points", deadline: null };
    }
    case "locked":
    case "cancelled":
      return { kind: "view_team", to: "/fantasy/team", deadline: null };
    case "scheduled":
    case "open":
    case undefined:
      // Mock mode carries no status; the deadline alone decides.
      return future(gameweek.deadline, now)
        ? {
            kind: "prepare",
            to: "/fantasy/team",
            deadline: { number: gameweek.number, at: gameweek.deadline },
          }
        : { kind: "view_team", to: "/fantasy/team", deadline: null };
  }
}

/**
 * The action's words. Literal keys, one per kind, so the i18n gate can see
 * every one of them (a computed key would count as an opaque call site).
 */
export function nextActionLabel(
  kind: FantasyNextActionKind,
  t: (key: TranslationKey) => string,
): string {
  switch (kind) {
    case "pending":
      return "";
    case "retry":
      return t("fantasy.next.retry");
    case "create":
      return t("fantasy.next.create");
    case "explore":
      return t("fantasy.next.explore");
    case "prepare":
      return t("fantasy.next.prepare");
    case "view_team":
      return t("fantasy.next.view_team");
    case "follow_points":
      return t("fantasy.next.follow_points");
    case "view_result":
      return t("fantasy.next.view_result");
    case "prepare_next":
      return t("fantasy.next.prepare_next");
    case "results":
      return t("fantasy.next.results");
  }
}
