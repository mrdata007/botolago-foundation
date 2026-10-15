// UX-004 — joining a private league, and what comes after.
//
// The join is one call; reading the league list again to find the league's name
// is another. They used to share one try/catch, so a failed second read after a
// successful join was reported as a bad invite code. Here the join's failure
// propagates (the caller classifies it), and the follow-up read can only ever
// produce `refreshFailed`.

import type { League } from "@/types/fantasy";

export interface JoinFlowDeps {
  /** The join itself; throws when the server (or the connection) refuses. */
  join: (code: string) => Promise<{ leagueId: string | null; joined: boolean }>;
  /** After a join: make the lists read the new membership. */
  invalidateLists: () => Promise<unknown>;
  /** After a join: the manager's private leagues, to name the one joined. */
  readLeagues: () => Promise<readonly League[]>;
}

export interface JoinFlowResult {
  /** False when the manager was a member already (the server's answer). */
  joined: boolean;
  /** The league's id as the server gave it; null only from an older server. */
  leagueId: string | null;
  /** The league as the list names it; null when it could not be found or read. */
  league: Pick<League, "id" | "name"> | null;
  /** True when the join went through but the list behind it could not be read. */
  refreshFailed: boolean;
}

export async function joinPrivateLeague(code: string, deps: JoinFlowDeps): Promise<JoinFlowResult> {
  // A failure here is the join's: it propagates untouched.
  const result = await deps.join(code);
  // From here the membership exists. Nothing below may turn that into a refusal.
  let league: League | null = null;
  let refreshFailed = false;
  try {
    await deps.invalidateLists();
    const leagues = await deps.readLeagues();
    // The league the server says was joined, not the list's last entry: an
    // already-member join, or a league created since, would name another.
    league =
      (result.leagueId ? leagues.find((item) => item.id === result.leagueId) : undefined) ??
      (result.leagueId ? null : (leagues[leagues.length - 1] ?? null));
  } catch {
    refreshFailed = true;
  }
  return {
    joined: result.joined,
    leagueId: result.leagueId,
    league: league ? { id: league.id, name: league.name } : null,
    refreshFailed,
  };
}
