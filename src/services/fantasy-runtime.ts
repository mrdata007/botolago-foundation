import { fantasyService as mockFantasyService, type FantasyTeamPatch } from "./fantasy-mock";
import { SupabaseFantasyRepository } from "@/backend/fantasy/supabase-repository";
import { selectFantasyDataMode } from "./fantasy-v2";
import { readFantasyAvailability, type FantasyAvailability } from "./fantasy-availability";
import {
  buildGlobalRankings,
  selectRankingsPage,
  type RankingsPage,
  type RankingsQuery,
} from "./fantasy-rankings";
import type { RepositoryContext } from "@/backend/contracts/repository";
import type {
  FantasyGameweekSummaryDto,
  FantasyOverallStandingDto,
  FantasyPlayerDto,
  FantasyPlayerGameweekHistoryEntryDto,
  FantasyPlayerSeasonStatDto,
  FantasyPointsDto,
  FantasyTeamDto,
} from "@/backend/fantasy/contracts";
import type {
  FantasyPlayer,
  FantasyTeam,
  FixtureDifficulty,
  GameweekResult,
  League,
  LeagueStanding,
  TopPlayerOfWeek,
} from "@/types/fantasy";
import type { FantasyAlert, FantasySummary, Gameweek, Player } from "@/types/domain";

const cloud = new SupabaseFantasyRepository();
const context = (): RepositoryContext => ({ actorId: null, requestId: crypto.randomUUID() });
const mode = () =>
  selectFantasyDataMode(import.meta.env.VITE_FANTASY_DATA_MODE, import.meta.env.PROD);

/**
 * BG-0071 — the pool RPC answers "may I pick this player" (position, club,
 * price, status); the three numbers a manager actually picks WITH — total
 * points, form and ownership — come from `api.fantasy_player_season_stats` and
 * are merged in here by fantasy player id.
 *
 * `stat` is undefined only when the player is absent from the season aggregate,
 * which should not happen (the RPC returns every active+eligible player of the
 * season). When it does, `form` stays `null` — "unknown" — rather than
 * inventing a 0. `dto.selectedByCount` is deliberately NOT read: the column has
 * no writer and is always 0, and this mapper was the last consumer standing
 * between it and a DROP.
 */
export function playerDto(dto: FantasyPlayerDto, stat?: FantasyPlayerSeasonStatDto): FantasyPlayer {
  const status =
    dto.status === "available"
      ? "available"
      : dto.status === "doubtful"
        ? "doubtful"
        : dto.status === "suspended"
          ? "suspended"
          : "injured";
  return {
    id: dto.id,
    name: { fr: dto.name, ar: dto.name },
    clubId: dto.footballTeamId,
    position: dto.position,
    price: dto.price,
    totalPoints: stat?.totalPoints ?? 0,
    form: stat ? stat.form : null,
    ownership: stat?.ownershipPercent ?? 0,
    status,
  };
}

function teamDto(dto: FantasyTeamDto): FantasyTeam {
  const starters = dto.lineup.filter((player) => player.slot === "starter");
  const counts = (position: "DEF" | "MID" | "FWD") =>
    starters.filter(
      (lineup) =>
        dto.squad.find((player) => player.fantasyPlayerId === lineup.fantasyPlayerId)?.position ===
        position,
    ).length;
  const formation =
    `${counts("DEF")}-${counts("MID")}-${counts("FWD")}` as FantasyTeam["formation"];
  return {
    managerName: "",
    teamName: dto.name,
    formation,
    squad: dto.lineup.map((player) => ({
      playerId: player.fantasyPlayerId,
      slot: player.slot === "starter" ? player.slotOrder : player.slotOrder + 11,
      isCaptain: player.captain || undefined,
      isViceCaptain: player.viceCaptain || undefined,
    })),
    bank: dto.bank,
    freeTransfers: dto.freeTransfers,
    pendingTransfers: 0,
  };
}

/**
 * BG-0075 — one gameweek's owned result.
 *
 * `autoSubs` and every player's `events` used to be hard-coded empty arrays
 * because `api.get_my_fantasy_points` returned neither, so the points page had
 * no way to explain a total. Both now come from the RPC:
 * `app.fantasy_player_point_events` (live rows only) and
 * `app.fantasy_auto_substitutions`.
 *
 * `summary` carries the gameweek-wide Average / Highest figures, which are
 * `null` — not 0 — until some team has been scored.
 */
function pointsDto(
  sequence: number,
  dto: FantasyPointsDto,
  summary: FantasyGameweekSummaryDto | null,
): GameweekResult | undefined {
  if (!dto.result) return undefined;
  const captain = dto.players.find((player) => player.captain);
  return {
    gameweek: sequence,
    totalPoints: dto.result.finalScore ?? dto.result.provisionalScore,
    benchPoints: dto.result.benchPoints,
    captainId: captain?.fantasyPlayerId,
    averagePoints: summary?.averagePoints ?? null,
    highestPoints: summary?.highestPoints ?? null,
    autoSubs: dto.autoSubstitutions.map((substitution) => ({
      outId: substitution.playerOutId,
      inId: substitution.playerInId,
      reasonKey: substitution.reason,
    })),
    breakdown: dto.players.map((player) => ({
      playerId: player.fantasyPlayerId,
      totalPoints: player.finalPoints ?? player.provisionalPoints ?? 0,
      minutesPlayed: player.minutesPlayed ?? 0,
      isCaptain: player.captain || undefined,
      isViceCaptain: player.viceCaptain || undefined,
      isBench: player.slot === "bench" || undefined,
      status: dto.pointsState === "final" ? "final" : "provisional",
      events: player.events.map((event) => ({
        category: event.category,
        points: event.points,
        fixtureId: event.fixtureId,
      })),
    })),
  };
}

/**
 * The Average / Highest strip must never take a page down: a gameweek that has
 * no summary yet is the normal case, and so is a transient RPC failure. Either
 * way the caller gets nulls and the UI renders an em dash.
 */
async function gameweekSummary(gameweekId: string): Promise<FantasyGameweekSummaryDto | null> {
  try {
    return await cloud.getGameweekSummary(gameweekId, context());
  } catch {
    return null;
  }
}

/**
 * The rankings board keys rows by `managerId`, which for the authoritative
 * board is the fantasy team id — the only stable public identifier a standing
 * carries. `managerName` is already resolved server-side (profile display name
 * for signed-in callers, team name otherwise).
 */
function overallStandingDto(dto: FantasyOverallStandingDto): LeagueStanding {
  return {
    managerId: dto.teamId,
    managerName: dto.managerName,
    teamName: dto.teamName,
    rank: dto.rank,
    previousRank: dto.previousRank ?? dto.rank,
    gameweekScore: dto.gameweekPoints ?? 0,
    totalScore: dto.totalPoints,
  };
}

async function hub() {
  return cloud.getHub("fr", context());
}

/**
 * BG-0071 — index the season aggregate by fantasy player id so the pool pages
 * can be merged in one pass. Exported for `fantasy-runtime.test.ts`.
 */
export function seasonStatsById(
  items: readonly FantasyPlayerSeasonStatDto[],
): Map<string, FantasyPlayerSeasonStatDto> {
  return new Map(items.map((item) => [item.fantasyPlayerId, item]));
}

async function allPlayers(): Promise<FantasyPlayer[]> {
  const current = await hub();
  // One statistics read per player-list load, alongside the paged pool. The
  // RPC is `stable` and the routes hold the result in React Query, so paging
  // the pool does not re-read it.
  const stats = seasonStatsById(
    (await cloud.getPlayerSeasonStats(current.season.id, null, context())).items,
  );
  const players: FantasyPlayer[] = [];
  let cursor: { price: number; id: string } | undefined;
  for (let page = 0; page < 20; page += 1) {
    const result = await cloud.getPlayerPool(
      { seasonId: current.season.id, cursor, limit: 100 },
      context(),
    );
    players.push(...result.items.map((item) => playerDto(item, stats.get(item.id))));
    if (!result.nextCursor) return players;
    cursor = result.nextCursor;
  }
  throw new Error("Fantasy player pool exceeded the bounded route read limit.");
}

/**
 * BG-0073 — the season-wide board as `LeagueStanding[]`, so the existing pure
 * `selectRankingsPage` keeps owning sort, search and paging and the rankings
 * route needs no change.
 *
 * The board is read through the RPC's keyset cursor and bounded the same way
 * the player pool is: 20 pages of 100. A season larger than that is a product
 * decision (server-side paging on the route) rather than an unbounded read.
 */
async function overallBoard(
  seasonId: string,
): Promise<{ rows: LeagueStanding[]; myRank?: LeagueStanding }> {
  const rows: LeagueStanding[] = [];
  let cursor: { rank: number; teamId: string } | null = null;
  let myRank: LeagueStanding | undefined;
  for (let page = 0; page < 20; page += 1) {
    const result = await cloud.getOverallStandings({ seasonId, cursor, limit: 100 }, context());
    rows.push(...result.items.map(overallStandingDto));
    if (result.myRank) myRank = overallStandingDto(result.myRank);
    if (!result.nextCursor) return { rows, myRank };
    cursor = result.nextCursor;
  }
  return { rows, myRank };
}

async function cloudTeam() {
  const current = await hub();
  if (!current.team) throw new Error("fantasy_team_not_found");
  return { hub: current, team: current.team };
}

export const fantasyService = {
  async getAvailability(): Promise<FantasyAvailability> {
    if (mode() === "mock") return { status: "ready", canCreate: true };
    return readFantasyAvailability(hub);
  },

  async getCurrentGameweek(): Promise<Gameweek> {
    if (mode() === "mock") {
      const { gameweek } = await import("@/mocks/data");
      return gameweek;
    }
    const current = await hub();
    if (!current.gameweek) throw new Error("fantasy_gameweek_not_found");
    // BG-0075: these were hard-coded zeros. Before any team is scored the
    // honest answer is null, and the UI renders an em dash for it.
    const summary = await gameweekSummary(current.gameweek.id);
    return {
      number: current.gameweek.sequence,
      deadline: current.gameweek.deadlineAt,
      isCurrent: !["finalized", "corrected", "cancelled"].includes(current.gameweek.status),
      name: current.gameweek.name,
      status: current.gameweek.status,
      pointsState: current.gameweek.pointsState,
      rankingAvailable: current.rankingAvailable,
      averagePoints: summary?.averagePoints ?? null,
      highestPoints: summary?.highestPoints ?? null,
    };
  },

  async getSummary(): Promise<FantasySummary | null> {
    if (mode() === "mock") {
      const [{ fantasySummary }, team] = await Promise.all([
        import("@/mocks/data"),
        mockFantasyService.getTeam(),
      ]);
      return {
        ...fantasySummary,
        teamName: team.teamName,
        managerName: team.managerName,
        transfersLeft: team.freeTransfers,
        bankValue: team.bank,
        teamValue: await mockFantasyService.getTeamValue(),
      };
    }
    const current = await hub();
    if (!current.team) return null;
    const history = await cloud.getHistory(current.team.id, null, context());
    const latest = history.items[0] ?? null;
    const currentResult =
      history.items.find((item) => item.gameweekId === current.gameweek?.id) ?? latest;
    return {
      // BG-0074: this was the empty string. `api.fantasy_hub` carries no
      // profile field, and `app.profiles.display_name` is not readable outside
      // the owner's own row, so the honest server-side answer here is the same
      // fallback api.fantasy_league_standings uses when a profile cannot be
      // resolved: the fantasy team name. Every caller already prefers the
      // signed-in user's own `user.displayName` over this (index.tsx,
      // fantasy.rankings.tsx), and FantasySummaryCard drops the manager line
      // when the two are identical rather than printing the name twice.
      managerName: current.team.name,
      teamName: current.team.name,
      totalPoints: history.items.reduce((sum, item) => sum + item.score, 0),
      gameweekPoints: currentResult?.score ?? 0,
      overallRank: latest?.overallRank ?? null,
      gameweekRank: currentResult?.rank ?? null,
      transfersLeft: current.team.freeTransfers,
      bankValue: current.team.bank,
      teamValue: current.team.teamValue,
    };
  },

  async getAlerts(): Promise<FantasyAlert[]> {
    if (mode() === "mock") {
      const { fantasyAlerts } = await import("@/mocks/data");
      return fantasyAlerts;
    }
    // The V2 Fantasy API has no approved alert projection yet. An honest
    // empty state is safer than presenting fixture data as current.
    return [];
  },

  async getTrendingPlayers(): Promise<Player[]> {
    if (mode() === "mock") {
      const [{ trendingPlayers }, players] = await Promise.all([
        import("@/mocks/data"),
        mockFantasyService.getPlayers(),
      ]);
      return trendingPlayers
        .map((id) => players.find((player) => player.id === id))
        .filter((player): player is FantasyPlayer => !!player);
    }
    const current = await hub();
    if (!current.gameweek) return [];
    const [top, players] = await Promise.all([
      cloud.getTopPlayers(current.gameweek.id, context()),
      allPlayers(),
    ]);
    const byId = new Map(players.map((player) => [player.id, player]));
    return top
      .map((entry) => {
        const player = byId.get(entry.fantasyPlayerId);
        return player ? { ...player, totalPoints: entry.points } : null;
      })
      .filter((player): player is FantasyPlayer => !!player);
  },

  async getPlayers(): Promise<FantasyPlayer[]> {
    return mode() === "mock" ? mockFantasyService.getPlayers() : allPlayers();
  },
  async getPlayer(id: string): Promise<FantasyPlayer | undefined> {
    if (mode() === "mock") return mockFantasyService.getPlayer(id);
    return (await allPlayers()).find((player) => player.id === id);
  },
  async getTeam(): Promise<FantasyTeam> {
    if (mode() === "mock") return mockFantasyService.getTeam();
    return teamDto((await cloudTeam()).team);
  },
  saveTeam(patch: FantasyTeamPatch): void {
    if (mode() === "mock") {
      mockFantasyService.saveTeam(patch);
      return;
    }
    throw new Error("Cloud Fantasy mutations must use the authoritative owned repository.");
  },
  async getTeamValue(): Promise<number> {
    if (mode() === "mock") return mockFantasyService.getTeamValue();
    return (await cloudTeam()).team.teamValue;
  },
  async getLeagues(type?: League["type"]): Promise<League[]> {
    if (mode() === "mock") return mockFantasyService.getLeagues(type);
    if (type === "cup") return [];
    const current = await hub();
    const leagues = await cloud.getLeagues(current.season.id, type ?? null, context());
    return leagues.map((league) => ({
      id: league.id,
      name: league.name,
      type: league.visibility,
      members: league.memberCount,
      rank: league.rank,
      previousRank: league.previousRank,
      score: league.totalPoints ?? 0,
      leaderName: league.leaderName ?? undefined,
      role: league.role ?? undefined,
    }));
  },
  async getLeague(id: string): Promise<League | undefined> {
    if (mode() === "mock") return mockFantasyService.getLeague(id);
    return (await this.getLeagues()).find((league) => league.id === id);
  },
  async getLeagueStandings(leagueId: string): Promise<LeagueStanding[]> {
    if (mode() === "mock") return mockFantasyService.getLeagueStandings(leagueId);
    const page = await cloud.getLeagueStandings(leagueId, null, context());
    return page.items.map((standing) => ({
      managerId: standing.teamId,
      // BG-0074: was the empty string, so every league row rendered a blank
      // manager line. Resolved server-side: the profile display name for
      // signed-in callers, the team name for anonymous ones.
      managerName: standing.managerName,
      teamName: standing.teamName,
      rank: standing.rank,
      previousRank: standing.previousRank ?? standing.rank,
      gameweekScore: standing.gameweekPoints ?? 0,
      totalScore: standing.totalPoints,
    }));
  },
  /**
   * Season-wide leaderboard across every fantasy team.
   *
   * Mock mode builds a deterministic 500-manager board.
   *
   * BG-0073: cloud mode used to take the largest PUBLIC league and show its
   * standings. Production has no public league at all, so a highlighted hub
   * tile rendered an empty board for every user for the whole season. It now
   * reads api.fantasy_overall_standings, the `league_id is null` rows the
   * ranking service already writes for exactly this board.
   *
   * `myRank` comes from the server, not from the client-side merge: the merge
   * would otherwise inject a synthetic rank-1 row for the signed-in manager
   * before any gameweek is scored, which would hide the "rankings available
   * after the first gameweek" empty state that BG-0073 exists to restore.
   */
  async getGlobalRankings(query: RankingsQuery): Promise<RankingsPage> {
    if (mode() === "mock") {
      return selectRankingsPage(buildGlobalRankings(), query);
    }
    const current = await hub();
    const { rows, myRank } = await overallBoard(current.season.id);
    // `me` is deliberately dropped: the authoritative board already contains
    // the signed-in manager's row once they are ranked.
    const page = selectRankingsPage(rows, {
      ...query,
      me: undefined,
      meId: myRank?.managerId ?? query.meId,
    });
    // Prefer the board's own copy of the row: under the "gameweek" sort
    // selectRankingsPage re-ranks, and `jumpToMe` pages by myRank.rank, so the
    // two must agree. Fall back to the server answer when the row is not on the
    // fetched board at all.
    return { ...page, myRank: page.myRank ?? myRank };
  },
  async getGameweekResult(sequence: number): Promise<GameweekResult | undefined> {
    if (mode() === "mock") return mockFantasyService.getGameweekResult(sequence);
    const current = await cloudTeam();
    const gameweeks = await cloud.getGameweeks(current.hub.season.id, null, context());
    const gameweek = gameweeks.items.find((item) => item.sequence === sequence);
    if (!gameweek) return undefined;
    const [points, summary] = await Promise.all([
      cloud.getPoints(current.team.id, gameweek.id, context()),
      gameweekSummary(gameweek.id),
    ]);
    return pointsDto(sequence, points, summary);
  },
  /**
   * The season-to-date list of finished gameweeks.
   *
   * BG-0075: `benchPoints` stays 0 here, and that is not a placeholder —
   * `api.get_my_fantasy_history` genuinely does not return it. Its rows carry
   * gameweekId, sequence, name, score, state, transferHit, chipType, rank,
   * overallRank, teamValue and bank, and nothing else; the bench figure lives
   * in `app.fantasy_team_gameweek_results.bench_points`, which only
   * `api.get_my_fantasy_points` projects, one gameweek at a time. Widening the
   * history RPC is a separate change and no surface reads this field today.
   * `averagePoints`/`highestPoints` are left undefined rather than zeroed for
   * the same reason: the history RPC cannot answer them, and a zero would
   * claim it had.
   */
  async getGameweekHistory(): Promise<GameweekResult[]> {
    if (mode() === "mock") return mockFantasyService.getGameweekHistory();
    const current = await cloudTeam();
    const history = await cloud.getHistory(current.team.id, null, context());
    return history.items.map((item) => ({
      gameweek: item.sequence,
      totalPoints: item.score,
      benchPoints: 0,
      averagePoints: null,
      highestPoints: null,
      autoSubs: [],
      breakdown: [],
    }));
  },
  async getFixtureDifficulty(): Promise<FixtureDifficulty[]> {
    if (mode() === "mock") return mockFantasyService.getFixtureDifficulty();
    const current = await hub();
    if (!current.gameweek) return [];
    const rows = await cloud.getFixtureDifficulty(
      current.season.id,
      current.gameweek.sequence,
      6,
      context(),
    );
    const counts = new Map<string, number>();
    for (const row of rows) {
      const key = `${row.clubId}:${row.gameweek}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return rows.map((row) => ({
      clubId: row.clubId,
      gameweek: row.gameweek,
      opponentClubId: row.opponentClubId,
      isHome: row.isHome,
      difficulty: row.difficulty as 1 | 2 | 3 | 4 | 5,
      isDouble: (counts.get(`${row.clubId}:${row.gameweek}`) ?? 0) > 1,
      kickoffAt: row.kickoffAt,
    }));
  },
  async getRules() {
    if (mode() === "mock") {
      return {
        seasonId: "00000000-0000-4000-8000-000000000001",
        rulesetId: "00000000-0000-4000-8000-000000000002",
        rulesetCode: "botolago-fantasy-preview",
        rulesetVersion: 1,
        rulesetSemanticVersion: "1.0",
        squadSize: 15,
        budget: 100,
        maxPlayersPerClub: 3,
        initialFreeTransfers: 1,
        maxFreeTransferRollover: 2,
        transferHitCost: 4,
        captainMultiplier: 2,
        tripleCaptainMultiplier: 3,
        deadline: { minutesBeforeFirstFixture: 90, gracePeriodSeconds: 0 },
        positions: [],
        scoring: [],
        chips: [],
        features: null,
      };
    }
    const current = await hub();
    return cloud.getRules(current.season.id, context());
  },
  async getTopPlayersOfWeek(gameweek: number): Promise<TopPlayerOfWeek[]> {
    if (mode() === "mock") return mockFantasyService.getTopPlayersOfWeek(gameweek);
    const current = await hub();
    const gameweeks = await cloud.getGameweeks(current.season.id, null, context());
    const target = gameweeks.items.find((item) => item.sequence === gameweek);
    if (!target) return [];
    // BG-0071: price, ownership and form used to be literal zeros here. They
    // come from the same season aggregate and pool that every other screen
    // reads, merged by fantasy player id. A player missing from the pool keeps
    // price/ownership 0 and form `null` ("unknown"), never a fabricated 0.0.
    const [top, players] = await Promise.all([
      cloud.getTopPlayers(target.id, context()),
      allPlayers(),
    ]);
    const byId = new Map(players.map((player) => [player.id, player]));
    return top.map((player, index) => {
      const pooled = byId.get(player.fantasyPlayerId);
      return {
        playerId: player.fantasyPlayerId,
        rank: (index + 1) as 1 | 2 | 3 | 4 | 5,
        gameweek,
        weeklyPoints: player.points,
        goals: 0,
        assists: 0,
        cleanSheets: 0,
        minutes: player.minutesPlayed,
        price: pooled?.price ?? 0,
        ownershipPercent: pooled?.ownership ?? 0,
        form: pooled ? pooled.form : null,
      };
    });
  },

  /**
   * BG-0071 — per-gameweek history for one player, oldest gameweek first, for
   * the player-detail History tab. Mock mode has no per-player history source,
   * so it answers with an honest empty list rather than inventing rows.
   */
  async getPlayerGameweekHistory(
    playerId: string,
  ): Promise<readonly FantasyPlayerGameweekHistoryEntryDto[]> {
    if (mode() === "mock") return [];
    return cloud.getPlayerGameweekHistory(playerId, context());
  },
  async getAvailableTopGameweeks(): Promise<number[]> {
    if (mode() === "mock") return mockFantasyService.getAvailableTopGameweeks();
    const current = await hub();
    const gameweeks = await cloud.getGameweeks(current.season.id, null, context());
    return gameweeks.items.map((gameweek) => gameweek.sequence).sort((a, b) => a - b);
  },
  async createLeague(name: string): Promise<{ id: string; code?: string }> {
    if (mode() === "mock") {
      const { leaguesStore } = await import("./leagues-store");
      const league = leaguesStore.create(name);
      return { id: league.id, code: league.code };
    }
    const current = await cloudTeam();
    const result = (await cloud.createLeague(
      current.hub.season.id,
      current.team.id,
      name.trim(),
      "private",
      crypto.randomUUID(),
      context(),
    )) as { leagueId: string; inviteCode?: string };
    return { id: result.leagueId, code: result.inviteCode };
  },
  async joinLeague(code: string): Promise<void> {
    if (mode() === "mock") {
      const { leaguesStore } = await import("./leagues-store");
      leaguesStore.join(code);
      return;
    }
    const current = await cloudTeam();
    await cloud.joinLeague(current.team.id, code, crypto.randomUUID(), context());
  },
  async leaveLeague(leagueId: string): Promise<void> {
    if (mode() === "mock") {
      const { leaguesStore } = await import("./leagues-store");
      leaguesStore.leave(leagueId);
      return;
    }
    const current = await cloudTeam();
    await cloud.leaveLeague(leagueId, current.team.id, context());
  },
  async archiveLeague(leagueId: string): Promise<void> {
    if (mode() === "mock") {
      const { leaguesStore } = await import("./leagues-store");
      leaguesStore.delete(leagueId);
      return;
    }
    const current = await cloudTeam();
    await cloud.archiveLeague(leagueId, current.team.id, context());
  },
};

export type FantasyRuntimeService = typeof fantasyService;
