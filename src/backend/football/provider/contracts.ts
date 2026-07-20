import type { FixtureStatus, FootballPosition } from "../contracts";

export interface ProviderRateLimit {
  readonly limit: number | null;
  readonly remaining: number | null;
  readonly resetsAt: string | null;
  readonly retryAfterMs: number | null;
}

export interface ProviderFreshness {
  readonly updatedAt: string;
  readonly sourceSequence: number;
  readonly sourceVersion: string | null;
  readonly provisional: boolean;
}

export interface ProviderPage<T> {
  readonly items: readonly T[];
  readonly nextCursor: string | null;
  readonly rateLimit: ProviderRateLimit;
}

export interface ProviderPageRequest {
  readonly cursor?: string | null;
  readonly limit: number;
  readonly signal?: AbortSignal;
}

export interface ProviderCompetition {
  readonly externalId: string;
  readonly name: string;
  readonly shortName: string | null;
  readonly type: "league" | "cup" | "super_cup" | "international" | "friendly";
  readonly countryCode: string | null;
  readonly freshness: ProviderFreshness;
}

export interface ProviderSeason {
  readonly externalId: string;
  readonly competitionExternalId: string;
  readonly label: string;
  readonly startsOn: string;
  readonly endsOn: string;
  readonly current: boolean;
  readonly freshness: ProviderFreshness;
}

export interface ProviderRound {
  readonly externalId: string;
  readonly seasonExternalId: string;
  readonly number: number | null;
  readonly name: string;
  readonly freshness: ProviderFreshness;
}

export interface ProviderTeam {
  readonly externalId: string;
  readonly name: string;
  readonly shortName: string;
  readonly code: string | null;
  readonly countryCode: string | null;
  readonly freshness: ProviderFreshness;
}

export interface ProviderPlayer {
  readonly externalId: string;
  readonly displayName: string;
  readonly fullName: string;
  readonly position: FootballPosition;
  readonly dateOfBirth: string | null;
  readonly nationalityCode: string | null;
  readonly freshness: ProviderFreshness;
}

export interface ProviderSquadMembership {
  readonly externalId: string;
  readonly playerExternalId: string;
  readonly teamExternalId: string;
  readonly seasonExternalId: string | null;
  readonly shirtNumber: number | null;
  readonly validFrom: string;
  readonly validTo: string | null;
  readonly freshness: ProviderFreshness;
}

export interface ProviderFixture {
  readonly externalId: string;
  readonly competitionExternalId: string;
  readonly seasonExternalId: string;
  readonly roundExternalId: string | null;
  readonly homeTeamExternalId: string;
  readonly awayTeamExternalId: string;
  readonly venueExternalId: string | null;
  readonly kickoffAt: string;
  readonly status: FixtureStatus;
  readonly period:
    | "pre_match"
    | "first_half"
    | "half_time"
    | "second_half"
    | "extra_time"
    | "penalties"
    | "post_match";
  readonly minute: number | null;
  readonly addedTime: number | null;
  readonly homeScore: number | null;
  readonly awayScore: number | null;
  readonly freshness: ProviderFreshness;
}

export interface ProviderStanding {
  readonly externalId: string;
  readonly competitionExternalId: string;
  readonly seasonExternalId: string;
  readonly teamExternalId: string;
  readonly groupKey: string;
  readonly rank: number;
  readonly played: number;
  readonly won: number;
  readonly drawn: number;
  readonly lost: number;
  readonly goalsFor: number;
  readonly goalsAgainst: number;
  readonly points: number;
  readonly freshness: ProviderFreshness;
}

export interface ProviderLineup {
  readonly externalId: string;
  readonly fixtureExternalId: string;
  readonly teamExternalId: string;
  readonly formation: string | null;
  readonly confirmed: boolean;
  readonly players: readonly {
    playerExternalId: string;
    slot: "starting" | "bench";
    shirtNumber: number | null;
    captain: boolean;
    order: number;
  }[];
  readonly freshness: ProviderFreshness;
}

export interface ProviderMatchEvent {
  readonly externalId: string;
  readonly fixtureExternalId: string;
  readonly teamExternalId: string | null;
  readonly playerExternalId: string | null;
  readonly relatedPlayerExternalId: string | null;
  readonly type: string;
  readonly minute: number;
  readonly addedTime: number;
  readonly sequence: number;
  readonly freshness: ProviderFreshness;
}

export interface ProviderMatchStatistic {
  readonly externalId: string;
  readonly fixtureExternalId: string;
  readonly teamExternalId: string;
  readonly code: string;
  readonly value: number;
  readonly displayValue: string | null;
  readonly freshness: ProviderFreshness;
}

export interface ProviderAvailability {
  readonly externalId: string;
  readonly playerExternalId: string;
  readonly teamExternalId: string | null;
  readonly status: "available" | "injured" | "suspended" | "doubtful" | "unknown";
  readonly startsOn: string;
  readonly expectedReturnOn: string | null;
  readonly endsOn: string | null;
  readonly freshness: ProviderFreshness;
}

export interface FootballProvider {
  readonly name: string;
  listCompetitions(request: ProviderPageRequest): Promise<ProviderPage<ProviderCompetition>>;
  listSeasons(request: ProviderPageRequest): Promise<ProviderPage<ProviderSeason>>;
  listRounds(request: ProviderPageRequest): Promise<ProviderPage<ProviderRound>>;
  listTeams(request: ProviderPageRequest): Promise<ProviderPage<ProviderTeam>>;
  listPlayers(request: ProviderPageRequest): Promise<ProviderPage<ProviderPlayer>>;
  listSquads(request: ProviderPageRequest): Promise<ProviderPage<ProviderSquadMembership>>;
  listFixtures(request: ProviderPageRequest): Promise<ProviderPage<ProviderFixture>>;
  listStandings(request: ProviderPageRequest): Promise<ProviderPage<ProviderStanding>>;
  listLineups(request: ProviderPageRequest): Promise<ProviderPage<ProviderLineup>>;
  listMatchEvents(request: ProviderPageRequest): Promise<ProviderPage<ProviderMatchEvent>>;
  listMatchStatistics(request: ProviderPageRequest): Promise<ProviderPage<ProviderMatchStatistic>>;
  listAvailability(request: ProviderPageRequest): Promise<ProviderPage<ProviderAvailability>>;
}
