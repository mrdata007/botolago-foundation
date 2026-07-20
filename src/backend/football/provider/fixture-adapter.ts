import type {
  FootballProvider,
  ProviderAvailability,
  ProviderCompetition,
  ProviderFixture,
  ProviderLineup,
  ProviderMatchEvent,
  ProviderMatchStatistic,
  ProviderPage,
  ProviderPageRequest,
  ProviderPlayer,
  ProviderRound,
  ProviderSeason,
  ProviderSquadMembership,
  ProviderStanding,
  ProviderTeam,
} from "./contracts";
import { providerFixtureSchema } from "./schemas";
import { FIXTURE_ADAPTER_STATUS_MAP, mapProviderFixtureStatus } from "./status";

// Raw shapes are intentionally adapter-private. They must never be imported by
// canonical DTOs, repositories, routes, or Fantasy.
interface RawFixtureRecord {
  readonly id: string;
  readonly competitionId: string;
  readonly seasonId: string;
  readonly roundId?: string | null;
  readonly homeId: string;
  readonly awayId: string;
  readonly venueId?: string | null;
  readonly kickoff: string;
  readonly status: keyof typeof FIXTURE_ADAPTER_STATUS_MAP;
  readonly minute?: number | null;
  readonly added?: number | null;
  readonly homeScore?: number | null;
  readonly awayScore?: number | null;
  readonly updatedAt: string;
  readonly sequence: number;
  readonly version?: string | null;
}

export interface FixtureAdapterDataset {
  readonly competitions?: readonly ProviderCompetition[];
  readonly seasons?: readonly ProviderSeason[];
  readonly rounds?: readonly ProviderRound[];
  readonly teams?: readonly ProviderTeam[];
  readonly players?: readonly ProviderPlayer[];
  readonly squads?: readonly ProviderSquadMembership[];
  readonly fixtures?: readonly RawFixtureRecord[];
  readonly standings?: readonly ProviderStanding[];
  readonly lineups?: readonly ProviderLineup[];
  readonly events?: readonly ProviderMatchEvent[];
  readonly statistics?: readonly ProviderMatchStatistic[];
  readonly availability?: readonly ProviderAvailability[];
}

const unlimited = { limit: null, remaining: null, resetsAt: null, retryAfterMs: null } as const;

function page<T>(items: readonly T[], request: ProviderPageRequest): ProviderPage<T> {
  const start = request.cursor ? Number.parseInt(request.cursor, 10) : 0;
  if (!Number.isSafeInteger(start) || start < 0) throw new Error("Invalid fixture cursor.");
  const selected = items.slice(start, start + request.limit);
  const next = start + selected.length < items.length ? String(start + selected.length) : null;
  return { items: selected, nextCursor: next, rateLimit: unlimited };
}

function periodFor(status: ProviderFixture["status"]): ProviderFixture["period"] {
  if (status === "live_first_half") return "first_half";
  if (status === "half_time") return "half_time";
  if (status === "live_second_half") return "second_half";
  if (status === "extra_time") return "extra_time";
  if (status === "penalties") return "penalties";
  if (status === "finished") return "post_match";
  return "pre_match";
}

export class FixtureFootballProvider implements FootballProvider {
  readonly name = "fixture";
  constructor(private readonly data: FixtureAdapterDataset = {}) {}

  async listCompetitions(request: ProviderPageRequest) {
    return page(this.data.competitions ?? [], request);
  }
  async listSeasons(request: ProviderPageRequest) {
    return page(this.data.seasons ?? [], request);
  }
  async listRounds(request: ProviderPageRequest) {
    return page(this.data.rounds ?? [], request);
  }
  async listTeams(request: ProviderPageRequest) {
    return page(this.data.teams ?? [], request);
  }
  async listPlayers(request: ProviderPageRequest) {
    return page(this.data.players ?? [], request);
  }
  async listSquads(request: ProviderPageRequest) {
    return page(this.data.squads ?? [], request);
  }
  async listStandings(request: ProviderPageRequest) {
    return page(this.data.standings ?? [], request);
  }
  async listLineups(request: ProviderPageRequest) {
    return page(this.data.lineups ?? [], request);
  }
  async listMatchEvents(request: ProviderPageRequest) {
    return page(this.data.events ?? [], request);
  }
  async listMatchStatistics(request: ProviderPageRequest) {
    return page(this.data.statistics ?? [], request);
  }
  async listAvailability(request: ProviderPageRequest) {
    return page(this.data.availability ?? [], request);
  }

  async listFixtures(request: ProviderPageRequest): Promise<ProviderPage<ProviderFixture>> {
    const normalized = (this.data.fixtures ?? []).map((raw) => {
      const status = mapProviderFixtureStatus(this.name, raw.status, FIXTURE_ADAPTER_STATUS_MAP);
      return providerFixtureSchema.parse({
        externalId: raw.id,
        competitionExternalId: raw.competitionId,
        seasonExternalId: raw.seasonId,
        roundExternalId: raw.roundId ?? null,
        homeTeamExternalId: raw.homeId,
        awayTeamExternalId: raw.awayId,
        venueExternalId: raw.venueId ?? null,
        kickoffAt: raw.kickoff,
        status,
        period: periodFor(status),
        minute: raw.minute ?? null,
        addedTime: raw.added ?? null,
        homeScore: raw.homeScore ?? null,
        awayScore: raw.awayScore ?? null,
        freshness: {
          updatedAt: raw.updatedAt,
          sourceSequence: raw.sequence,
          sourceVersion: raw.version ?? null,
          provisional: !["finished", "cancelled", "abandoned"].includes(status),
        },
      });
    });
    return page(normalized, request);
  }
}
