import { fantasyService as mockFantasyService, type FantasyTeamPatch } from "./fantasy-mock";
import { SupabaseFantasyRepository } from "@/backend/fantasy/supabase-repository";
import { selectFantasyDataMode } from "./fantasy-v2";
import { hubIdentity } from "./fantasy-identity";
import { forgetSharedFantasyHub, shareFantasyHub } from "./fantasy-hub-share";
import { shareRead } from "./shared-read";
import {
  enrolmentGameweekOf,
  readFantasyAvailability,
  type FantasyAvailability,
} from "./fantasy-availability";
import {
  buildGlobalRankings,
  selectBoardPage,
  selectRankingsPage,
  type RankingsPage,
  type RankingsQuery,
} from "./fantasy-rankings";
import { BoardReader, boardReaders, SEARCH_SCAN_ROWS } from "./fantasy-board-reader";
import {
  nextLeagueCursor,
  type LeagueStandingCursor,
  type LeagueStandingsPage,
} from "./fantasy-league-pages";
import type { RepositoryContext } from "@/backend/contracts/repository";
import type {
  FantasyGameweekSummaryDto,
  FantasyHubDto,
  FantasyOverallStandingDto,
  FantasyPlayerDto,
  FantasyPlayerGameweekHistoryEntryDto,
  FantasyPlayerSeasonStatDto,
  FantasyPointsDto,
  FantasyMyRecapPublicationDto,
  FantasyPublicRecapDto,
  FantasyRecapPublicationDto,
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
import { resolveMediaUrl } from "@/lib/media";

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
    // The release's public path starts with the `football/` namespace, which
    // the resolver maps to the `football-media` bucket.
    photoUrl: dto.photo ? (resolveMediaUrl({ storagePath: dto.photo.storagePath }) ?? null) : null,
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
export function pointsDto(
  sequence: number,
  dto: FantasyPointsDto,
  summary: FantasyGameweekSummaryDto | null,
): GameweekResult | undefined {
  if (!dto.result) return undefined;
  const captain = dto.players.find((player) => player.captain);
  return {
    authoritative: {
      ratingPublication: dto.ratingPublication,
      startingIds: dto.players
        .filter((p) => p.slot === "starter")
        .sort((a, b) => a.slotOrder - b.slotOrder)
        .map(
          (p) =>
            dto.autoSubstitutions.find((s) => s.playerOutId === p.fantasyPlayerId)?.playerInId ??
            p.fantasyPlayerId,
        ),
      benchIds: dto.players
        .filter((p) => p.slot === "bench")
        .sort((a, b) => a.slotOrder - b.slotOrder)
        .map((p) => p.fantasyPlayerId),
      effectiveCaptainId: dto.players.find((p) => p.multiplier > 1)?.fantasyPlayerId ?? null,
      captainMultiplier: dto.players.find((p) => p.multiplier > 1)?.multiplier ?? 1,
      captainPoints: dto.result.captainPoints,
      transferHit: dto.result.transferHit,
      chipType: dto.result.chipType,
      incremental: dto.incrementalScoring === true,
      finalized: dto.pointsState === "final",
      closedProvisional: dto.closedAt != null && dto.pointsState !== "final",
      startingPoints: dto.result.startingPoints,
      finalScore: dto.result.finalScore,
      gameweekStatus: dto.gameweekStatus,
      calculationVersion: dto.result.calculationVersion,
      finalizedAt: dto.result.finalizedAt,
    },
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
      identity: player.identity
        ? {
            name: player.identity.name,
            position: player.identity.position,
            clubId: player.identity.footballTeamId,
            teamName: player.identity.teamName,
            teamShortName: player.identity.teamShortName,
          }
        : undefined,
      multiplier: player.multiplier,
      ratingPending: player.ratingPending,
      pointsKnown: player.finalPoints !== null || player.provisionalPoints !== null,
      totalPoints: player.finalPoints ?? player.provisionalPoints ?? 0,
      minutesPlayed: player.minutesPlayed ?? 0,
      isCaptain: player.captain || undefined,
      isViceCaptain: player.viceCaptain || undefined,
      isBench: player.slot === "bench" || undefined,
      status: dto.pointsState === "final" ? "final" : "provisional",
      fixtureScoring:
        player.fixtureScoring ??
        dto.fixtureScoring?.filter((fixture) =>
          player.events.some((event) => event.fixtureId === fixture.fixtureId),
        ),
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
export function overallStandingDto(dto: FantasyOverallStandingDto): LeagueStanding {
  return {
    managerId: dto.teamId,
    managerName: dto.managerName,
    teamName: dto.teamName,
    rank: dto.rank,
    // FANT-04: an unknown earlier rank stays unknown. Falling back to the
    // current rank drew "unchanged" for a board that has no history yet.
    previousRank: dto.previousRank,
    gameweekScore: dto.gameweekPoints ?? 0,
    totalScore: dto.totalPoints,
  };
}

/** One hub read per screen and account: see `fantasy-hub-share.ts`. */
async function hub(): Promise<FantasyHubDto> {
  const identity = await hubIdentity();
  return shareFantasyHub(() => cloud.getHub("fr", context()), { identity });
}

/** The hub's enrolment gameweek in the screens' `Gameweek` vocabulary. */
function enrolmentOf(current: FantasyHubDto): Gameweek["enrolment"] {
  const enrolment = enrolmentGameweekOf(current);
  return enrolment
    ? { id: enrolment.id, number: enrolment.sequence, deadline: enrolment.deadlineAt }
    : null;
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

/**
 * The whole pool, read once for the screens that ask together: Home's alert
 * strip, Top players and the player lists each used to walk it on their own.
 */
async function allPlayers(): Promise<FantasyPlayer[]> {
  const current = await hub();
  return shareRead(`players:${current.season.id}`, () => readAllPlayers(current));
}

async function readAllPlayers(current: FantasyHubDto): Promise<FantasyPlayer[]> {
  // One statistics read per player-list load, alongside the paged pool. The
  // RPC is `stable` and the routes hold the result in React Query, so paging
  // the pool does not re-read it.
  // The statistics read runs beside the first page of the pool rather than
  // before it: the pages are walked by cursor, one after the other, and the
  // statistics are only needed to dress them once they are all in.
  const statsRead = cloud.getPlayerSeasonStats(current.season.id, null, context());
  const items: FantasyPlayerDto[] = [];
  let cursor: { price: number; id: string } | undefined;
  let complete = false;
  try {
    for (let page = 0; page < 20 && !complete; page += 1) {
      const result = await cloud.getPlayerPool(
        { seasonId: current.season.id, cursor, limit: 100 },
        context(),
      );
      items.push(...result.items);
      if (result.nextCursor) cursor = result.nextCursor;
      else complete = true;
    }
  } catch (error) {
    // Do not leave the statistics read to fail unobserved.
    statsRead.catch(() => undefined);
    throw error;
  }
  const stats = seasonStatsById((await statsRead).items);
  if (!complete) throw new Error("Fantasy player pool exceeded the bounded route read limit.");
  return items.map((item) => playerDto(item, stats.get(item.id)));
}

/**
 * BG-0073 / FANT-05 — a reader over the season board, or over one round's
 * board when a `gameweekId` is given.
 *
 * The RPC pages by keyset cursor, returns the board's real total and the
 * caller's own standing. The reader (see `fantasy-board-reader.ts`) reads only
 * the blocks of 100 a page needs, keeps them for a short while, and finds a far
 * block with one read; it no longer walks the board from the top for every page
 * turn, search keystroke and refresh, and it no longer stops at 2,000 managers.
 *
 * With a `gameweekId` it reads that round's own board: the server ranks the
 * round by round points with the official tie-breaks, and the rows keep the
 * server's order, ranks and previous ranks.
 *
 * Readers are kept per account (the rows carry the caller's `myRank` and, for a
 * signed-in caller, display names), season and board, a few at a time.
 */
const KEEP_BOARD_READERS = 8;

// Also cleared with the shared hub read (`forgetSharedFantasyHub`): on a write, an
// account switch and a sign-out. Re-exported for the tests.
export { forgetBoardReaders } from "./fantasy-board-reader";

function boardReader(identity: string, seasonId: string, gameweekId: string | null): BoardReader {
  const key = `${identity}|${seasonId}|${gameweekId ?? "season"}`;
  const held = boardReaders.get(key);
  if (held) return held;
  const reader = new BoardReader(async (cursor, limit) => {
    const result = await cloud.getOverallStandings(
      { seasonId, gameweekId, cursor, limit },
      context(),
    );
    return {
      rows: result.items.map(overallStandingDto),
      nextCursor: result.nextCursor,
      total: result.total,
      myRank: result.myRank ? overallStandingDto(result.myRank) : null,
    };
  });
  boardReaders.set(key, reader);
  while (boardReaders.size > KEEP_BOARD_READERS) {
    const oldest = boardReaders.keys().next().value;
    if (oldest === undefined) break;
    boardReaders.delete(oldest);
  }
  return reader;
}

/**
 * One page of a board the server has ordered and ranked. Without a search it is
 * read from the server a page at a time. The server cannot search, so a search
 * looks through the first `SEARCH_SCAN_ROWS` rows (read once and held) and
 * reports `searchLimit` when the board is larger than that, never silently.
 */
async function boardPage(reader: BoardReader, query: RankingsQuery): Promise<RankingsPage> {
  if (!query.query.trim()) {
    const read = await reader.page(query.page, query.pageSize);
    return {
      rows: read.rows,
      total: read.total,
      podium: reader.top(3),
      myRank: read.myRank ?? undefined,
    };
  }
  const scan = await reader.scan(SEARCH_SCAN_ROWS);
  const page = selectBoardPage(scan.rows, { ...query, meId: scan.myRank?.managerId ?? query.meId });
  return {
    ...page,
    myRank: page.myRank ?? scan.myRank ?? undefined,
    searchLimit: scan.complete ? undefined : { scanned: scan.rows.length, total: scan.total },
  };
}

/** Gameweeks that can already have a round board: scoring has begun on them. */
const ROUND_BOARD_STATUSES: ReadonlySet<string> = new Set([
  "live",
  "provisional",
  "finalizing",
  "finalized",
  "corrected",
]);

/**
 * The gameweeks to try for the round board, newest first (at most three): the
 * round the ranking worker scored last is the one whose board is current. A
 * gameweek that scoring has not reached has no round board, and is skipped.
 */
export function roundBoardGameweekIds(
  gameweeks: ReadonlyArray<{ id: string; sequence: number; status: string }>,
): string[] {
  return gameweeks
    .filter((gameweek) => ROUND_BOARD_STATUSES.has(gameweek.status))
    .sort((a, b) => b.sequence - a.sequence)
    .slice(0, 3)
    .map((gameweek) => gameweek.id);
}

/** The season's gameweek list; screens that start together share one read. */
function gameweeksOf(seasonId: string) {
  return shareRead(`gameweeks:${seasonId}`, () => cloud.getGameweeks(seasonId, null, context()));
}

async function gameweekIdOf(seasonId: string, sequence: number): Promise<string | null> {
  const gameweeks = await gameweeksOf(seasonId);
  return gameweeks.items.find((item) => item.sequence === sequence)?.id ?? null;
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
      enrolment: enrolmentOf(current),
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
      // BG-0157 (2): the round that figure is for, from the same row, so the
      // hub can name it and never print last round's score under this one's.
      pointsGameweek: currentResult?.sequence ?? null,
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
  /**
   * The first page (at most 100) of a league's standings. The league screen
   * reads the rest through `getLeagueStandingsPage`; the screens that only need
   * the top of a league (the Curva rankings, the list after joining) stay on this.
   */
  async getLeagueStandings(leagueId: string): Promise<LeagueStanding[]> {
    return (await this.getLeagueStandingsPage(leagueId, null)).rows;
  },
  /**
   * FANT-03 — one page of a league's standings, from `cursor` (the first page
   * when null), with the member count and where the next page starts.
   */
  async getLeagueStandingsPage(
    leagueId: string,
    cursor: LeagueStandingCursor | null = null,
  ): Promise<LeagueStandingsPage> {
    if (mode() === "mock") {
      const rows = await mockFantasyService.getLeagueStandings(leagueId);
      return { rows, memberCount: rows.length, nextCursor: null };
    }
    const page = await cloud.getLeagueStandings(leagueId, null, context(), cursor);
    const rows = page.items.map(
      (standing): LeagueStanding => ({
        managerId: standing.teamId,
        // BG-0074: was the empty string, so every league row rendered a blank
        // manager line. Resolved server-side: the profile display name for
        // signed-in callers, the team name for anonymous ones.
        managerName: standing.managerName,
        teamName: standing.teamName,
        rank: standing.rank,
        // An unknown earlier rank stays unknown (null): the table draws a dash, not "unchanged".
        previousRank: standing.previousRank,
        gameweekScore: standing.gameweekPoints ?? 0,
        totalScore: standing.totalPoints,
        calculatedAt: standing.calculatedAt,
      }),
    );
    return { rows, memberCount: page.league.memberCount, nextCursor: nextLeagueCursor(rows) };
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
    const identity = await hubIdentity();
    if (query.sort === "gameweek") {
      // FANT-04: the round board is the server's, read for one gameweek, in the
      // server's order. The browser neither re-sorts ties nor renumbers ranks,
      // and the previous rank is the one the round board itself holds (null
      // when it holds none), never the overall rank.
      const gameweeks = await gameweeksOf(current.season.id);
      for (const gameweekId of roundBoardGameweekIds(gameweeks.items)) {
        const reader = boardReader(identity, current.season.id, gameweekId);
        if ((await reader.block(0)).rows.length === 0) continue;
        return boardPage(reader, query);
      }
      // No round has been ranked yet: the same empty answer as the season board.
      return { rows: [], total: 0, podium: [] };
    }
    // `me` is deliberately dropped: the authoritative board already contains
    // the signed-in manager's row once they are ranked, and `myRank` is the
    // server's, so `jumpToMe` pages by a rank the board itself agrees with.
    return boardPage(boardReader(identity, current.season.id, null), query);
  },
  /**
   * The first `limit` (at most 100) managers of the overall board, from ONE read of its first page.
   * `getGlobalRankings` reads a block of 100 and more as the pages need them; a screen that only needs the
   * top of the board (the Curva ranking) reads just this.
   */
  async getTopOverallStandings(limit = 100): Promise<LeagueStanding[]> {
    const size = Math.max(1, Math.min(100, Math.floor(limit)));
    if (mode() === "mock") {
      return selectRankingsPage(buildGlobalRankings(), {
        page: 1,
        pageSize: size,
        sort: "overall",
        query: "",
      }).rows;
    }
    const current = await hub();
    const result = await cloud.getOverallStandings(
      { seasonId: current.season.id, cursor: null, limit: size },
      context(),
    );
    return result.items.map(overallStandingDto);
  },
  async getGameweekResult(sequence: number): Promise<GameweekResult | undefined> {
    if (mode() === "mock") return mockFantasyService.getGameweekResult(sequence);
    const current = await cloudTeam();
    const gameweeks = await gameweeksOf(current.hub.season.id);
    const gameweek = gameweeks.items.find((item) => item.sequence === sequence);
    if (!gameweek) return undefined;
    const [points, summary] = await Promise.all([
      cloud.getPoints(current.team.id, gameweek.id, context()),
      gameweekSummary(gameweek.id),
    ]);
    return pointsDto(sequence, points, summary);
  },
  /**
   * Fantasy R4 — the owner's public link for one gameweek's recap, and
   * whether publishing is switched on. Mock mode has no server: off.
   */
  async getMyRecapPublication(sequence: number): Promise<FantasyMyRecapPublicationDto> {
    if (mode() === "mock") return { publishEnabled: false, publication: null };
    const current = await cloudTeam();
    const gameweekId = await gameweekIdOf(current.hub.season.id, sequence);
    if (!gameweekId) return { publishEnabled: false, publication: null };
    return cloud.getMyGameweekRecapPublication(current.team.id, gameweekId, context());
  },
  async publishRecap(sequence: number, alias: string): Promise<FantasyRecapPublicationDto> {
    const current = await cloudTeam();
    const gameweekId = await gameweekIdOf(current.hub.season.id, sequence);
    if (!gameweekId) throw new Error("fantasy_gameweek_not_found");
    return cloud.publishGameweekRecap(current.team.id, gameweekId, alias.trim(), context());
  },
  async revokeRecap(publicId: string): Promise<void> {
    return cloud.revokeGameweekRecap(publicId, context());
  },
  /** Anyone, signed in or not: the public projection, or null. */
  async getPublicRecap(publicId: string): Promise<FantasyPublicRecapDto | null> {
    if (mode() === "mock") return null;
    return cloud.getPublicGameweekRecap(publicId, context());
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
      // BG-0157 (5): the v1 ruleset's positions, scoring and chips rows
      // (`supabase/migrations/20260720163222_fantasy_ruleset_v1.sql`), in the
      // shape and order `api.fantasy_rules` returns them — positions by
      // display order, scoring by category, position code then threshold,
      // chips by first round then allocation code — so a local run shows
      // the table production shows. `fantasy-runtime.rules.test.ts` holds
      // these rows to the migration.
      const rules: Awaited<ReturnType<typeof cloud.getRules>> = {
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
        positions: [
          {
            code: "GK",
            squadQuota: 2,
            startingMinimum: 1,
            startingMaximum: 1,
            goalPoints: 10,
            cleanSheetPoints: 4,
          },
          {
            code: "DEF",
            squadQuota: 5,
            startingMinimum: 3,
            startingMaximum: 5,
            goalPoints: 6,
            cleanSheetPoints: 4,
          },
          {
            code: "MID",
            squadQuota: 5,
            startingMinimum: 2,
            startingMaximum: 5,
            goalPoints: 5,
            cleanSheetPoints: 1,
          },
          {
            code: "FWD",
            squadQuota: 3,
            startingMinimum: 1,
            startingMaximum: 3,
            goalPoints: 4,
            cleanSheetPoints: 0,
          },
        ],
        scoring: [
          { category: "appearance_full", points: 2, threshold: 60, position: null },
          { category: "appearance_short", points: 1, threshold: 1, position: null },
          { category: "direct_red_card", points: -3, threshold: null, position: null },
          { category: "goals_conceded", points: -1, threshold: 2, position: "DEF" },
          { category: "goals_conceded", points: -1, threshold: 2, position: "GK" },
          { category: "official_assist", points: 3, threshold: null, position: null },
          { category: "own_goal", points: -2, threshold: null, position: null },
          { category: "penalty_miss", points: -2, threshold: null, position: null },
          { category: "penalty_save", points: 5, threshold: null, position: "GK" },
          { category: "saves", points: 1, threshold: 3, position: "GK" },
          { category: "second_yellow_dismissal", points: -3, threshold: null, position: null },
          { category: "yellow_card", points: -1, threshold: null, position: null },
        ],
        chips: [
          {
            allocationCode: "bench_boost",
            chipType: "bench_boost",
            startsAtGameweek: 1,
            endsAtGameweek: null,
            cancellable: false,
          },
          {
            allocationCode: "free_hit",
            chipType: "free_hit",
            startsAtGameweek: 1,
            endsAtGameweek: null,
            cancellable: false,
          },
          {
            allocationCode: "triple_captain",
            chipType: "triple_captain",
            startsAtGameweek: 1,
            endsAtGameweek: null,
            cancellable: false,
          },
          {
            allocationCode: "wildcard_1",
            chipType: "wildcard",
            startsAtGameweek: 1,
            endsAtGameweek: 15,
            cancellable: false,
          },
          {
            allocationCode: "wildcard_2",
            chipType: "wildcard",
            startsAtGameweek: 16,
            endsAtGameweek: null,
            cancellable: false,
          },
        ],
        features: null,
      };
      return rules;
    }
    const current = await hub();
    return cloud.getRules(current.season.id, context());
  },
  async getTopPlayersOfWeek(gameweek: number): Promise<TopPlayerOfWeek[]> {
    if (mode() === "mock") return mockFantasyService.getTopPlayersOfWeek(gameweek);
    const current = await hub();
    const gameweeks = await gameweeksOf(current.season.id);
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
        // `fantasy_top_players` reports points and minutes only. Goals,
        // assists and clean sheets are unknown here, not zero.
        goals: null,
        assists: null,
        cleanSheets: null,
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
    const gameweeks = await gameweeksOf(current.season.id);
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
    forgetSharedFantasyHub();
    return { id: result.leagueId, code: result.inviteCode };
  },
  /**
   * Joins by invite code. The server answers which league it was and whether
   * this team was already in it (`joined: false`), so callers never have to
   * guess the league from the list. `leagueId` is null only when an older
   * server answers nothing usable.
   */
  async joinLeague(code: string): Promise<{ leagueId: string | null; joined: boolean }> {
    if (mode() === "mock") {
      const { leaguesStore } = await import("./leagues-store");
      const league = leaguesStore.join(code);
      return { leagueId: league.id, joined: true };
    }
    const current = await cloudTeam();
    const result = (await cloud.joinLeague(
      current.team.id,
      code,
      crypto.randomUUID(),
      context(),
    )) as { leagueId?: unknown; joined?: unknown } | null;
    forgetSharedFantasyHub();
    return {
      leagueId: typeof result?.leagueId === "string" ? result.leagueId : null,
      joined: result?.joined !== false,
    };
  },
  async leaveLeague(leagueId: string): Promise<void> {
    if (mode() === "mock") {
      const { leaguesStore } = await import("./leagues-store");
      leaguesStore.leave(leagueId);
      return;
    }
    const current = await cloudTeam();
    await cloud.leaveLeague(leagueId, current.team.id, context());
    forgetSharedFantasyHub();
  },
  async archiveLeague(leagueId: string): Promise<void> {
    if (mode() === "mock") {
      const { leaguesStore } = await import("./leagues-store");
      leaguesStore.delete(leagueId);
      return;
    }
    const current = await cloudTeam();
    await cloud.archiveLeague(leagueId, current.team.id, context());
    forgetSharedFantasyHub();
  },
};

export type FantasyRuntimeService = typeof fantasyService;
