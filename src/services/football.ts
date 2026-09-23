import type { Club, Match, MatchStatus, TableRow } from "@/types/domain";
import type { RepositoryContext } from "@/backend/contracts/repository";
import type {
  FootballLanguage,
  FootballRepository,
  MatchCardDto,
  MatchLineupDto,
  SeasonSummaryDto,
  StandingRowDto,
  TeamSummaryDto,
} from "@/backend/football/contracts";
import { FootballError } from "@/backend/football/errors";
import { MockFootballRepository } from "@/backend/football/mock-repository";
import { SupabaseFootballRepository } from "@/backend/football/supabase-repository";
import { clubShortCode } from "@/lib/club-identity";
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
    competitionName: season.competition.name,
  };
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
};
