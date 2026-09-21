import type { FantasyDataSource } from "@/services/fantasy-data-source";
import type { LeagueStanding } from "@/types/fantasy";

/**
 * Whether the visitor looking at the global rankings owns a Fantasy team.
 *
 * This is deliberately a three-valued answer. The rankings card used to infer
 * it from the presence of a *standing*, and a standing is not evidence either
 * way: before the first gameweek is scored nobody has a rank, so every manager
 * — team or no team — looked identical to the card, and every one of them was
 * told to create the team they already had. `unresolved` keeps the card from
 * making that claim while the owned snapshot is still in flight or failed.
 */
export type TeamPresence =
  | { status: "unresolved" }
  | { status: "absent" }
  | { status: "present"; teamName: string | null };

/** What the "my rank" card can honestly show. */
export type MyRankState =
  | { kind: "ranked"; standing: LeagueStanding }
  /** A team exists, but no points have been scored yet, so there is no rank. */
  | { kind: "unranked"; teamName: string | null }
  /** No team: the create-team call to action is the correct next step. */
  | { kind: "no_team" }
  /** Team ownership is not known yet; say nothing rather than guess. */
  | { kind: "pending" };

export interface TeamPresenceInput {
  /** Which owned-Fantasy source is authoritative for this visitor. */
  source: FantasyDataSource;
  /**
   * Squad size from the owned snapshot. The snapshot always carries a team
   * object — an empty placeholder one when no team exists — so the squad is
   * what actually distinguishes the two, exactly as `useFantasyScreen` does.
   */
  squadSize: number;
  teamName?: string | null;
  /** The owned snapshot is still loading. */
  isLoading?: boolean;
  /** The owned snapshot failed to load. */
  errored?: boolean;
}

/**
 * Resolves team ownership from the owned snapshot.
 *
 * A signed-out visitor genuinely has no team, so `guest` is a definitive
 * `absent` and still gets the create-team route. A loading or failed snapshot
 * is `unresolved`: neither says the manager has no team, and a failure must
 * not be reported as one.
 */
export function selectTeamPresence({
  source,
  squadSize,
  teamName = null,
  isLoading = false,
  errored = false,
}: TeamPresenceInput): TeamPresence {
  if (source === "guest") return { status: "absent" };
  if (squadSize > 0) return { status: "present", teamName: teamName?.trim() || null };
  if (isLoading || errored) return { status: "unresolved" };
  return { status: "absent" };
}

/**
 * Chooses what the "my rank" card says.
 *
 * A standing is proof of both a team and a rank, so it wins outright. Without
 * one, the answer comes from team ownership alone — never from the missing
 * standing, which is the conflation this exists to remove.
 */
export function selectMyRankState({
  standing,
  presence,
}: {
  standing?: LeagueStanding;
  presence: TeamPresence;
}): MyRankState {
  if (standing) return { kind: "ranked", standing };
  if (presence.status === "present") return { kind: "unranked", teamName: presence.teamName };
  if (presence.status === "unresolved") return { kind: "pending" };
  return { kind: "no_team" };
}
