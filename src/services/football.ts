import type { Club, Match, MatchStatus, TableRow } from "@/types/domain";
import type { RepositoryContext } from "@/backend/contracts/repository";
import type {
  FootballLanguage,
  FootballRepository,
  MatchCardDto,
  StandingRowDto,
  TeamSummaryDto,
} from "@/backend/football/contracts";
import { FootballError } from "@/backend/football/errors";
import { MockFootballRepository } from "@/backend/football/mock-repository";
import { SupabaseFootballRepository } from "@/backend/football/supabase-repository";
import { resolveMediaUrl } from "@/lib/media";
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

export function presentFootballClub(team: TeamSummaryDto, supabaseUrl?: string | null): Club {
  const placeholder = team.code ?? team.shortName.slice(0, 3).toUpperCase();
  return {
    id: team.id,
    name: { fr: team.name, ar: team.name },
    shortName: { fr: team.shortName, ar: team.shortName },
    city: { fr: team.city ?? "", ar: team.city ?? "" },
    primaryColor: team.primaryColor ?? "#0a2540",
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

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export interface FootballMatchCollection {
  readonly matches: readonly Match[];
  readonly clubs: readonly Club[];
  readonly standings: readonly TableRow[];
}

export const footballService = {
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

  async getMatchDay(date: Date, language: FootballLanguage): Promise<FootballMatchCollection> {
    const repository = getFootballRepository();
    const page = await repository.getMatchesByDate(
      { date: dateKey(date), language, timezone: "Africa/Casablanca", limit: 100 },
      requestContext(),
    );
    const firstSeason = page.items[0]?.seasonId;
    const standings = firstSeason
      ? await repository.getStandings(firstSeason, language, requestContext())
      : [];
    return {
      matches: page.items.map(toMatch),
      clubs: uniqueClubs(page.items, standings),
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
    }
  > {
    const repository = getFootballRepository();
    const detail = await repository.getMatchDetail(id, language, requestContext());
    const match = toMatch(detail);
    const [headToHead, standings, timeline, statistics] = await Promise.all([
      repository.getHeadToHead(id, language, 5, requestContext()),
      repository.getStandings(detail.seasonId, language, requestContext()),
      repository.getTimeline(id, language, requestContext()),
      repository.getStatistics(id, language, requestContext()),
    ]);
    const allMatches = [detail, ...headToHead];
    return {
      match,
      headToHead: headToHead.map(toMatch),
      live: presentMatchLiveDetail(match, timeline, statistics),
      matches: allMatches.map(toMatch),
      clubs: uniqueClubs(allMatches, standings),
      standings: standings.map(toTableRow),
    };
  },
};
