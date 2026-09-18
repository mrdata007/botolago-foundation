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
  FantasyPlayerDto,
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

function playerDto(dto: FantasyPlayerDto): FantasyPlayer {
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
    totalPoints: 0,
    form: 0,
    ownership: 0,
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

function pointsDto(sequence: number, dto: FantasyPointsDto): GameweekResult | undefined {
  if (!dto.result) return undefined;
  const captain = dto.players.find((player) => player.captain);
  return {
    gameweek: sequence,
    totalPoints: dto.result.finalScore ?? dto.result.provisionalScore,
    benchPoints: dto.result.benchPoints,
    captainId: captain?.fantasyPlayerId,
    autoSubs: [],
    breakdown: dto.players.map((player) => ({
      playerId: player.fantasyPlayerId,
      totalPoints: player.finalPoints ?? player.provisionalPoints,
      minutesPlayed: player.minutesPlayed,
      isCaptain: player.captain || undefined,
      isViceCaptain: player.viceCaptain || undefined,
      isBench: player.slot === "bench" || undefined,
      status: dto.pointsState === "final" ? "final" : "provisional",
      events: [],
    })),
  };
}

async function hub() {
  return cloud.getHub("fr", context());
}

async function allPlayers(): Promise<FantasyPlayer[]> {
  const current = await hub();
  const players: FantasyPlayer[] = [];
  let cursor: { price: number; id: string } | undefined;
  for (let page = 0; page < 20; page += 1) {
    const result = await cloud.getPlayerPool(
      { seasonId: current.season.id, cursor, limit: 100 },
      context(),
    );
    players.push(...result.items.map(playerDto));
    if (!result.nextCursor) return players;
    cursor = result.nextCursor;
  }
  throw new Error("Fantasy player pool exceeded the bounded route read limit.");
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
    return {
      number: current.gameweek.sequence,
      deadline: current.gameweek.deadlineAt,
      isCurrent: !["finalized", "corrected", "cancelled"].includes(current.gameweek.status),
      name: current.gameweek.name,
      status: current.gameweek.status,
      pointsState: current.gameweek.pointsState,
      rankingAvailable: current.rankingAvailable,
      averagePoints: 0,
      highestPoints: 0,
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
      managerName: "",
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
      managerName: "",
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
   * Mock mode builds a deterministic 500-manager board. Cloud mode reads the
   * largest public league (the global board) and maps its standings; no
   * schema change is required.
   */
  async getGlobalRankings(query: RankingsQuery): Promise<RankingsPage> {
    if (mode() === "mock") {
      return selectRankingsPage(buildGlobalRankings(), query);
    }
    const publicLeagues = await this.getLeagues("public");
    const global = [...publicLeagues].sort((a, b) => b.members - a.members)[0];
    if (!global) {
      return { rows: [], total: 0, podium: [], myRank: undefined };
    }
    const standings = await this.getLeagueStandings(global.id);
    return selectRankingsPage(standings, query);
  },
  async getGameweekResult(sequence: number): Promise<GameweekResult | undefined> {
    if (mode() === "mock") return mockFantasyService.getGameweekResult(sequence);
    const current = await cloudTeam();
    const gameweeks = await cloud.getGameweeks(current.hub.season.id, null, context());
    const gameweek = gameweeks.items.find((item) => item.sequence === sequence);
    if (!gameweek) return undefined;
    return pointsDto(sequence, await cloud.getPoints(current.team.id, gameweek.id, context()));
  },
  async getGameweekHistory(): Promise<GameweekResult[]> {
    if (mode() === "mock") return mockFantasyService.getGameweekHistory();
    const current = await cloudTeam();
    const history = await cloud.getHistory(current.team.id, null, context());
    return history.items.map((item) => ({
      gameweek: item.sequence,
      totalPoints: item.score,
      benchPoints: 0,
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
    const top = await cloud.getTopPlayers(target.id, context());
    return top.map((player, index) => ({
      playerId: player.fantasyPlayerId,
      rank: (index + 1) as 1 | 2 | 3 | 4 | 5,
      gameweek,
      weeklyPoints: player.points,
      goals: 0,
      assists: 0,
      cleanSheets: 0,
      minutes: player.minutesPlayed,
      price: 0,
      ownershipPercent: 0,
      form: 0,
    }));
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
