import type { RepositoryContext } from "@/backend/contracts/repository";
import * as mock from "@/mocks/data";
import type {
  AvailabilityStatusDto,
  CompetitionSummaryDto,
  FootballLanguage,
  FootballRepository,
  MatchCardDto,
  MatchPageDto,
  MatchesByDateInput,
  PlayerSummaryDto,
  SeasonSummaryDto,
  StandingRowDto,
  TeamSummaryDto,
} from "./contracts";
import { FootballError } from "./errors";

const uuid = (domain: number, index: number) =>
  `${String(domain).padStart(8, "0")}-0000-4000-8000-${String(index).padStart(12, "0")}`;
const COMPETITION_ID = uuid(40, 1);
const clubId = new Map(mock.clubs.map((club, index) => [club.id, uuid(10, index + 1)]));
const matchIndex = new Map(mock.matches.map((match, index) => [match.id, index + 1]));
const playerId = new Map(mock.players.map((player, index) => [player.id, uuid(30, index + 1)]));

export function mockFootballTeamId(sourceId: string): string {
  const id = clubId.get(sourceId);
  if (!id) throw new FootballError("data_unavailable", "Mock team was not found.");
  return id;
}

const competition: CompetitionSummaryDto = {
  id: COMPETITION_ID,
  slug: "botola-pro-mock",
  name: "Botola Pro",
  shortName: "Botola",
  type: "league",
  countryCode: "MA",
  logoUrl: null,
  logoPath: null,
  active: true,
};

interface MockSeason {
  readonly id: string;
  readonly index: number;
  readonly label: string;
  readonly startsOn: string;
  readonly endsOn: string;
  readonly status: SeasonSummaryDto["status"];
  readonly isCurrent: boolean;
  readonly yearOffset: number;
}

const now = new Date();
const currentSeasonStartYear = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
const mockSeasons: readonly MockSeason[] = Array.from({ length: 4 }, (_, index) => {
  const startYear = currentSeasonStartYear - index;
  return {
    id: uuid(50, index + 1),
    index,
    label: `${startYear}/${startYear + 1}`,
    startsOn: `${startYear}-07-01`,
    endsOn: `${startYear + 1}-06-30`,
    status: index === 0 ? "active" : "completed",
    isCurrent: index === 0,
    yearOffset: -index,
  };
});

function shiftYear(iso: string, yearOffset: number): string {
  const shifted = new Date(iso);
  shifted.setFullYear(shifted.getFullYear() + yearOffset);
  return shifted.toISOString();
}

function localDateKey(iso: string): string {
  const local = new Date(iso);
  return `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, "0")}-${String(local.getDate()).padStart(2, "0")}`;
}

function seasonSummary(season: MockSeason): SeasonSummaryDto {
  const matchDates = mock.matches
    .map((match) => localDateKey(shiftYear(match.kickoff, season.yearOffset)))
    .sort();
  return {
    id: season.id,
    competition,
    label: season.label,
    startsOn: season.startsOn,
    endsOn: season.endsOn,
    status: season.status,
    isCurrent: season.isCurrent,
    firstMatchDate: matchDates[0] ?? null,
    lastMatchDate: matchDates.at(-1) ?? null,
  };
}

function matchUuid(sourceId: string, season: MockSeason): string {
  return uuid(20 + season.index, matchIndex.get(sourceId)!);
}

function localized(value: { fr: string; ar: string }, language: FootballLanguage) {
  return value[language] || value.fr;
}

function team(sourceId: string, language: FootballLanguage): TeamSummaryDto {
  const source = mock.clubs.find((club) => club.id === sourceId);
  if (!source) throw new FootballError("data_unavailable", "Mock team was not found.");
  return {
    id: mockFootballTeamId(source.id),
    slug: source.id,
    name: localized(source.name, language),
    shortName: localized(source.shortName, language),
    code: source.crestPlaceholder,
    city: localized(source.city, language),
    countryCode: "MA",
    crestUrl: null,
    crestPath: null,
    primaryColor: source.primaryColor,
    secondaryColor: source.secondaryColor ?? null,
    active: true,
  };
}

function normalizedStatus(status: (typeof mock.matches)[number]["status"]): MatchCardDto["status"] {
  if (status === "live") return "live_second_half";
  if (status === "finished") return "finished";
  if (status === "postponed") return "postponed";
  return "scheduled";
}

function fixture(
  source: (typeof mock.matches)[number],
  language: FootballLanguage,
  season: MockSeason = mockSeasons[0]!,
): MatchCardDto {
  const sourceStatus = normalizedStatus(source.status);
  const status = season.isCurrent ? sourceStatus : "finished";
  const kickoff = shiftYear(source.kickoff, season.yearOffset);
  const historicalScore = matchIndex.get(source.id)! % 3;
  return {
    id: matchUuid(source.id, season),
    competition,
    seasonId: season.id,
    seasonLabel: season.label,
    roundId: null,
    roundName: source.gameweek ? `Gameweek ${source.gameweek}` : null,
    roundNumber: source.gameweek,
    homeTeam: team(source.homeClubId, language),
    awayTeam: team(source.awayClubId, language),
    venue: {
      id: uuid(60, mock.matches.indexOf(source) + 1),
      slug: `mock-venue-${source.id}`,
      name: localized(source.venue, language),
      city: null,
      capacity: null,
      countryCode: "MA",
    },
    kickoffAt: kickoff,
    status,
    period:
      status === "finished"
        ? "post_match"
        : status.startsWith("live")
          ? "second_half"
          : "pre_match",
    minute: source.minute ?? null,
    addedTime: null,
    homeScore: source.homeScore ?? (season.isCurrent ? null : historicalScore),
    awayScore: source.awayScore ?? (season.isCurrent ? null : (historicalScore + 1) % 3),
    halfTimeHomeScore: null,
    halfTimeAwayScore: null,
    extraTimeHomeScore: null,
    extraTimeAwayScore: null,
    penaltyHomeScore: null,
    penaltyAwayScore: null,
    winnerTeamId: null,
    attendance: null,
    providerUpdatedAt: kickoff,
    sourceSequence: 1,
    finalizedAt: status === "finished" ? kickoff : null,
    updatedAt: kickoff,
  };
}

function sameLocalDate(iso: string, date: string): boolean {
  return localDateKey(iso) === date;
}

export class MockFootballRepository implements FootballRepository {
  async getSeasons(
    _language: FootballLanguage,
    limit: number,
    _context: RepositoryContext,
  ): Promise<readonly SeasonSummaryDto[]> {
    return mockSeasons.slice(0, limit).map(seasonSummary);
  }
  async getTeams(language: FootballLanguage, limit: number) {
    return mock.clubs.slice(0, limit).map((club) => team(club.id, language));
  }
  async getHomeMatches(language: FootballLanguage, limit: number, _context: RepositoryContext) {
    return mock.matches
      .filter((match) => match.status === "live" || match.status === "scheduled")
      .slice(0, limit)
      .map((match) => fixture(match, language));
  }
  async getLiveMatches(language: FootballLanguage, limit: number, _context: RepositoryContext) {
    return mock.matches
      .filter((match) => match.status === "live")
      .slice(0, limit)
      .map((match) => fixture(match, language));
  }
  async getMatchesByDate(
    input: MatchesByDateInput,
    _context: RepositoryContext,
  ): Promise<MatchPageDto> {
    const seasons = input.seasonId
      ? mockSeasons.filter((season) => season.id === input.seasonId)
      : mockSeasons;
    return {
      items: seasons.flatMap((season) =>
        mock.matches
          .map((match) => fixture(match, input.language, season))
          .filter((match) => sameLocalDate(match.kickoffAt, input.date)),
      ),
      nextCursor: null,
    };
  }
  async getMatchDetail(id: string, language: FootballLanguage, _context: RepositoryContext) {
    for (const season of mockSeasons) {
      const source = mock.matches.find((match) => matchUuid(match.id, season) === id);
      if (source) return fixture(source, language, season);
    }
    throw new FootballError("fixture_not_found", "The match was not found.");
  }
  async getTimeline() {
    return [];
  }
  async getLineups() {
    return [];
  }
  async getStatistics() {
    return [];
  }
  async getHeadToHead(
    id: string,
    language: FootballLanguage,
    limit: number,
    context: RepositoryContext,
  ) {
    const target = await this.getMatchDetail(id, language, context);
    return mockSeasons
      .flatMap((season) => mock.matches.map((match) => fixture(match, language, season)))
      .filter(
        (match) =>
          match.id !== id &&
          match.status === "finished" &&
          ((match.homeTeam.id === target.homeTeam.id && match.awayTeam.id === target.awayTeam.id) ||
            (match.homeTeam.id === target.awayTeam.id && match.awayTeam.id === target.homeTeam.id)),
      )
      .slice(0, limit);
  }
  async getStandings(
    _seasonId: string,
    language: FootballLanguage,
    _context: RepositoryContext,
  ): Promise<readonly StandingRowDto[]> {
    return mock.tableRows.map((row, index) => ({
      id: uuid(70, index + 1),
      rank: row.position,
      team: team(row.clubId, language),
      played: row.played,
      won: row.won,
      drawn: row.drawn,
      lost: row.lost,
      goalsFor: Math.max(row.goalDifference, 0),
      goalsAgainst: Math.max(-row.goalDifference, 0),
      goalDifference: row.goalDifference,
      points: row.points,
      form: row.form.join(""),
      qualificationCode: null,
      providerUpdatedAt: new Date(0).toISOString(),
    }));
  }
  async getCompetition(): Promise<CompetitionSummaryDto> {
    return competition;
  }
  async getTeam(id: string, language: FootballLanguage): Promise<TeamSummaryDto> {
    const source = mock.clubs.find((club) => clubId.get(club.id) === id);
    if (!source) throw new FootballError("data_unavailable", "The team was not found.");
    return team(source.id, language);
  }
  async getPlayer(id: string, language: FootballLanguage): Promise<PlayerSummaryDto> {
    const source = mock.players.find((player) => playerId.get(player.id) === id);
    if (!source) throw new FootballError("data_unavailable", "The player was not found.");
    const position = {
      GK: "goalkeeper",
      DEF: "defender",
      MID: "midfielder",
      FWD: "forward",
    } as const;
    return {
      id,
      slug: source.id,
      fullName: localized(source.name, language),
      displayName: localized(source.name, language),
      firstName: null,
      lastName: null,
      dateOfBirth: null,
      position: position[source.position],
      preferredFoot: "unknown",
      nationality: null,
      currentTeam: team(source.clubId, language),
      shirtNumber: null,
      active: true,
    };
  }
  async getAvailability(): Promise<readonly AvailabilityStatusDto[]> {
    return [];
  }
}
