import type { ReportTarget } from "@/lib/report-content";
import type { League, LeagueStanding } from "@/types/fantasy";

/**
 * Who chose a name, so who may report it: never the reader about their own.
 * Pure, so the rules are tested without rendering a page.
 */

/**
 * Whether a standings row is the reader's own team. A standing's `managerId`
 * is the Fantasy team id (`fantasy-runtime.ts`); the mock data and the local
 * league store write the reader's own row as `"me"`.
 */
export function isOwnStanding(managerId: string, ownTeamId: string | null | undefined): boolean {
  return managerId === "me" || (!!ownTeamId && managerId === ownTeamId);
}

/**
 * Whether a league's name was chosen by someone else, so the reader may
 * report it. Only private leagues have a name a user chose (a public league
 * is BotolaGO's own, and `createLeague` only ever makes private ones), and
 * the reader's own league (`owner`, or `creator` in the local store) is theirs.
 */
export function isOthersLeague(league: Pick<League, "type" | "role">): boolean {
  return league.type === "private" && league.role !== "owner" && league.role !== "creator";
}

/**
 * What a standings row can report: the team's name, and the manager's when
 * the row shows it (it is hidden when it repeats the team name). Both are
 * found by the team id, the only id a standing carries.
 */
export function standingReportTargets(
  row: Pick<LeagueStanding, "managerId" | "teamName" | "managerName">,
): ReportTarget[] {
  const id = `team:${row.managerId}`;
  const targets: ReportTarget[] = [{ kind: "team", name: row.teamName, id }];
  if (row.managerName && row.managerName !== row.teamName) {
    targets.push({ kind: "user", name: row.managerName, id });
  }
  return targets;
}
