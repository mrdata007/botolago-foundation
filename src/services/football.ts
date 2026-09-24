import type { Club, Match, MatchStatus, TableRow } from "@/types/domain";
import type { RepositoryContext } from "@/backend/contracts/repository";
import type {
  FootballLanguage,
  FootballRepository,
  MatchCardDto,
  MatchLineupDto,
  MatchPageCursor,
  SeasonSummaryDto,
  SquadMemberDto,
  StandingRowDto,
  TeamSummaryDto,
} from "@/backend/football/contracts";
import { FootballError } from "@/backend/football/errors";
import { MockFootballRepository } from "@/backend/football/mock-repository";
import { SupabaseFootballRepository } from "@/backend/football/supabase-repository";
import { clubShortCode } from "@/lib/club-identity";
import type { SquadPlayer } from "@/lib/club-season";
import { resolveMediaUrl } from "@/lib/media";
import { matchDayKey } from "@/lib/match-kickoff";
import { presentMatchLiveDetail, type MatchLiveDetail } from "@/services/match-live";

export type FootballDataMode = "mock" | "supabase";

export function selectFootballDataMode(
  configuredMode: string | undefined,
  production: boolean,
): FootballDataMode {
  if (production && configuredMode !== "supabase") {
    throw new FootballError(
      "data_unavailable",
      "Production Football requires VITE_FOOTBALL_DATA_MODE=supabase.",
    );
  }
  if (configuredMode === "mock" || configuredMode === "supabase") return configuredMode;
  return "mock";
}

const mockRepository = new MockFootballRepository();
const supabaseRepository = new SupabaseFootballRepository();

export function getFootballRepository(): FootballRepository {
  const mode = selectFootballDataMode(
    import.meta.env.VITE_FOOTBALL_DATA_MODE,
    import.meta.env.PROD,
  );
  return mode === "supabase" ? supabaseRepository : mockRepository;
}

function requestContext(): RepositoryContext {
  return {
    actorId: null,
    requestId: globalThis.crypto?.randomUUID?.() ?? `football-${Date.now().toString(36)}`,
  };
}

function presentationStatus(status: MatchCardDto["status"]): MatchStatus {
  if (
    ["live_first_half", "half_time", "live_second_half", "extra_time", "penalties"].includes(status)
  )
    return "live";
  if (status === "finished") return "finished";
  if (["postponed", "cancelled", "suspended", "abandoned"].includes(status)) return "postponed";
  return "scheduled";
}

/**
 * The fixtures that are in play by the product's own reading of the status.
 * The repository's live query also returns `delayed` and `suspended`
 * fixtures, which every other screen presents as scheduled and postponed;
 * in the live strip they would carry its live dot and a 0–0 from null scores.
 */
export function inPlayFixtures<T extends Pick<MatchCardDto, "status">>(
  fixtures: readonly T[],
): T[] {
  return fixtures.filter((fixture) => presentationStatus(fixture.status) === "live");
}

/**
 * The provider statuses in which the fixture no longer has a date.
 *
 * Narrower than the four that collapse into the domain `postponed` above: a
 * suspended or abandoned match kicked off at the stored instant and keeps
 * that date -- it is history, not a plan -- so only these two lose it.
 */
const DATE_UNCONFIRMED_STATUSES: readonly MatchCardDto["status"][] = ["postponed", "cancelled"];

export function presentFootballClub(team: TeamSummaryDto, supabaseUrl?: string | null): Club {
  // BG-0111 — `team.code` is blank (not null) for 13 of the 21 active clubs on
  // production, and `??` does not fall back on `""`. That shipped an empty
  // crest placeholder for most of the league: blank initials in `ClubCrest`
  // and a bare "(D)" on the pitch fixture plate. `clubShortCode` treats a
  // whitespace-only code as absent and derives the letters from `short_name`,
  // which is populated for all 21.
  const placeholder = clubShortCode(team.code, team.shortName);
  return {
    id: team.id,
    slug: team.slug,
    name: { fr: team.name, ar: team.name },
    shortName: { fr: team.shortName, ar: team.shortName },
    city: { fr: team.city ?? "", ar: team.city ?? "" },
    // Every one of the 21 production clubs has a null `primary_color`
    // (BG-0112), so this fallback is what the whole league renders as today.
    // It was a hardcoded navy: a literal colour, light-only, one shade away
    // from the token that means exactly this. `--ui-ink` is the brand FILL,
    // which is the job here — a crest plate is a fill, and the monogram on it
    // is `--ui-on-ink-plain`.
    primaryColor: team.primaryColor ?? "var(--ui-ink)",
    secondaryColor: team.secondaryColor ?? undefined,
    crestPlaceholder: placeholder,
    crestUrl: resolveMediaUrl(
      { sourceUrl: team.crestUrl, storagePath: team.crestPath },
      supabaseUrl,
    ),
  };
}

function toMatch(match: MatchCardDto): Match {
  const venueName = match.venue?.name ?? "";
  return {
    id: match.id,
    gameweek: match.roundNumber ?? 0,
    homeClubId: match.homeTeam.id,
    awayClubId: match.awayTeam.id,
    kickoff: match.kickoffAt,
    status: presentationStatus(match.status),
    minute: match.minute ?? undefined,
    homeScore: match.homeScore ?? undefined,
    awayScore: match.awayScore ?? undefined,
    halfTimeHomeScore: match.halfTimeHomeScore ?? undefined,
    halfTimeAwayScore: match.halfTimeAwayScore ?? undefined,
    venue: { fr: venueName, ar: venueName },
    dateUnconfirmed: DATE_UNCONFIRMED_STATUSES.includes(match.status),
  };
}

function toTableRow(row: StandingRowDto): TableRow {
  return {
    position: row.rank,
    clubId: row.team.id,
    played: row.played,
    won: row.won,
    drawn: row.drawn,
    lost: row.lost,
    goalDifference: row.goalDifference,
    goalsFor: row.goalsFor,
    goalsAgainst: row.goalsAgainst,
    points: row.points,
    form:
      row.form
        ?.split("")
        .filter((item): item is "W" | "D" | "L" => ["W", "D", "L"].includes(item)) ?? [],
  };
}

export interface FootballSeason {
  readonly id: string;
  readonly label: string;
  readonly startsOn: string;
  readonly endsOn: string;
  readonly status: SeasonSummaryDto["status"];
  readonly isCurrent: boolean;
  readonly firstMatchDate: string | null;
  readonly lastMatchDate: string | null;
  readonly competitionId: string;
  readonly competitionName: string;
}

function toSeason(season: SeasonSummaryDto): FootballSeason {
  return {
    id: season.id,
    label: season.label,
    startsOn: season.startsOn,
    endsOn: season.endsOn,
    status: season.status,
    isCurrent: season.isCurrent,
    firstMatchDate: season.firstMatchDate,
    lastMatchDate: season.lastMatchDate,
    competitionId: season.competition.id,
    competitionName: season.competition.name,
  };
}

/** The season a club page opens on: the current one, else the latest listed. */
export function defaultSeason(seasons: readonly FootballSeason[]): FootballSeason | undefined {
  return seasons.find((season) => season.isCurrent) ?? seasons[0];
}

export function presentSquadMember(member: SquadMemberDto): SquadPlayer {
  return {
    id: member.playerId,
    name: member.displayName,
    position: member.position,
    shirtNumber: member.shirtNumber,
    role: member.squadRole,
  };
}

/** Clubs by name, in the reader's language's collation. */
function byClubName(language: FootballLanguage) {
  const collator = new Intl.Collator(language === "ar" ? "ar-MA" : "fr-FR");
  return (a: Club, b: Club) => collator.compare(a.name[language], b.name[language]);
}

/**
 * How many pages of a club's fixtures (100 a page) a season may take to
 * reach. A season is 30 league matches; the cap only stops a runaway loop.
 */
const CLUB_FIXTURE_PAGES = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface ClubDirectory {
  /**
   * The season the clubs were read from, or null when no season named any
   * club and the list is the whole team catalogue instead (which also holds
   * clubs that have since left the league).
   */
  readonly season: FootballSeason | null;
  readonly clubs: readonly Club[];
}

function uniqueClubs(
  matches: readonly MatchCardDto[],
  standings: readonly StandingRowDto[] = [],
): Club[] {
  const teams = new Map<string, TeamSummaryDto>();
  for (const match of matches) {
    teams.set(match.homeTeam.id, match.homeTeam);
    teams.set(match.awayTeam.id, match.awayTeam);
  }
  for (const row of standings) teams.set(row.team.id, row.team);
  return [...teams.values()].map((team) => presentFootballClub(team));
}

/**
 * The day key sent to the backend, which resolves it against
 * `Africa/Casablanca`. Reading the browser's calendar fields here asked for a
 * different day than the page then filtered on, for every viewer outside
 * UTC+1 (BG-0100).
 */
const dateKey = matchDayKey;

export interface FootballMatchCollection {
  readonly matches: readonly Match[];
  readonly clubs: readonly Club[];
  readonly standings: readonly TableRow[];
}

export const footballService = {
  async getSeasons(language: FootballLanguage): Promise<FootballSeason[]> {
    return (await getFootballRepository().getSeasons(language, 12, requestContext())).map(toSeason);
  },

  async getClubs(language: FootballLanguage): Promise<Club[]> {
    return (await getFootballRepository().getTeams(language, 100, requestContext())).map((team) =>
      presentFootballClub(team),
    );
  },

  async getHomeMatches(language: FootballLanguage): Promise<FootballMatchCollection> {
    const repository = getFootballRepository();
    const matches = await repository.getHomeMatches(language, 3, requestContext());
    return { matches: matches.map(toMatch), clubs: uniqueClubs(matches), standings: [] };
  },

  /** Matches in play right now, for the live strip. */
  async getLiveMatches(language: FootballLanguage): Promise<FootballMatchCollection> {
    const repository = getFootballRepository();
    const matches = inPlayFixtures(await repository.getLiveMatches(language, 10, requestContext()));
    return { matches: matches.map(toMatch), clubs: uniqueClubs(matches), standings: [] };
  },

  async getMatchDay(
    date: Date,
    language: FootballLanguage,
    seasonId?: string,
  ): Promise<FootballMatchCollection> {
    const repository = getFootballRepository();
    const page = await repository.getMatchesByDate(
      {
        date: dateKey(date),
        language,
        timezone: "Africa/Casablanca",
        seasonId,
        limit: 100,
      },
      requestContext(),
    );
    const matches = seasonId
      ? page.items.filter((match) => match.seasonId === seasonId)
      : page.items;
    const standingsSeasonId = seasonId ?? matches[0]?.seasonId;
    const standings = standingsSeasonId
      ? await repository.getStandings(standingsSeasonId, language, requestContext())
      : [];
    return {
      matches: matches.map(toMatch),
      clubs: uniqueClubs(matches, standings),
      standings: standings.map(toTableRow),
    };
  },

  async getMatchDetailPage(
    id: string,
    language: FootballLanguage,
  ): Promise<
    FootballMatchCollection & {
      match: Match;
      headToHead: readonly Match[];
      live: MatchLiveDetail;
      /** Confirmed/provisional lineups, one entry per team. Empty when the
       * provider has not published lineups yet — never fabricated. */
      lineups: readonly MatchLineupDto[];
    }
  > {
    const repository = getFootballRepository();
    const detail = await repository.getMatchDetail(id, language, requestContext());
    const match = toMatch(detail);
    const [headToHead, standings, timeline, statistics, lineups] = await Promise.all([
      repository.getHeadToHead(id, language, 5, requestContext()),
      repository.getStandings(detail.seasonId, language, requestContext()),
      repository.getTimeline(id, language, requestContext()),
      repository.getStatistics(id, language, requestContext()),
      repository.getLineups(id, language, requestContext()),
    ]);
    const allMatches = [detail, ...headToHead];
    return {
      match,
      headToHead: headToHead.map(toMatch),
      live: presentMatchLiveDetail(match, timeline, statistics),
      lineups,
      matches: allMatches.map(toMatch),
      clubs: uniqueClubs(allMatches, standings),
      standings: standings.map(toTableRow),
    };
  },

  async getClub(id: string, language: FootballLanguage): Promise<Club> {
    return presentFootballClub(
      await getFootballRepository().getTeam(id, language, requestContext()),
    );
  },

  /**
   * The clubs of the current season (else the latest one), by name: the
   * teams in its table, and — before a table exists, as at the start of a
   * season — the teams in its first 100 fixtures, which cover every club by
   * the end of the first rounds. The full team catalogue is only the last
   * resort: it also lists clubs that have been relegated.
   */
  async getClubDirectory(language: FootballLanguage): Promise<ClubDirectory> {
    const repository = getFootballRepository();
    const season = defaultSeason(await footballService.getSeasons(language)) ?? null;
    if (season) {
      const [standings, page] = await Promise.all([
        repository.getStandings(season.id, language, requestContext()),
        repository.getCompetitionFixtures(
          {
            competitionId: season.competitionId,
            seasonId: season.id,
            language,
            limit: 100,
          },
          requestContext(),
        ),
      ]);
      const clubs = uniqueClubs(page.items, standings);
      if (clubs.length > 0) return { season, clubs: clubs.sort(byClubName(language)) };
    }
    const catalogue = await footballService.getClubs(language);
    return { season: null, clubs: catalogue.sort(byClubName(language)) };
  },

  /**
   * One club's matches in one season, oldest first, and every club they
   * name. The API pages a club's fixtures newest first across all seasons,
   * so this reads back until it has passed the season's first day.
   */
  async getClubSeasonMatches(
    clubId: string,
    season: Pick<FootballSeason, "id" | "startsOn"> | null,
    language: FootballLanguage,
  ): Promise<FootballMatchCollection> {
    const repository = getFootballRepository();
    const collected: MatchCardDto[] = [];
    let before: MatchPageCursor | null = null;
    for (let page = 0; page < CLUB_FIXTURE_PAGES; page += 1) {
      const items = await repository.getTeamFixtures(
        { teamId: clubId, language, before, limit: 100 },
        requestContext(),
      );
      collected.push(...items);
      const oldest = items.at(-1);
      if (!season || !oldest || items.length < 100) break;
      // A day of slack either side of midnight: the season's date is a
      // calendar day, the kickoff an instant.
      if (Date.parse(oldest.kickoffAt) < Date.parse(`${season.startsOn}T00:00:00Z`) - DAY_MS) break;
      before = { kickoffAt: oldest.kickoffAt, id: oldest.id };
    }
    const matches = (
      season ? collected.filter((match) => match.seasonId === season.id) : collected
    ).sort((a, b) => Date.parse(a.kickoffAt) - Date.parse(b.kickoffAt));
    return { matches: matches.map(toMatch), clubs: uniqueClubs(matches), standings: [] };
  },

  /** A season's table and the clubs in it. */
  async getSeasonTable(
    seasonId: string,
    language: FootballLanguage,
  ): Promise<Pick<FootballMatchCollection, "clubs" | "standings">> {
    const rows = await getFootballRepository().getStandings(seasonId, language, requestContext());
    return { clubs: uniqueClubs([], rows), standings: rows.map(toTableRow) };
  },

  /** `seasonId` null: the club's current squad; a season id: its squad that season. */
  async getClubSquad(
    clubId: string,
    seasonId: string | null,
    language: FootballLanguage,
  ): Promise<SquadPlayer[]> {
    const squad = await getFootballRepository().getTeamSquad(
      clubId,
      seasonId,
      language,
      requestContext(),
    );
    return squad.map(presentSquadMember);
  },
};
