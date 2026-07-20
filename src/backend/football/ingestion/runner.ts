import { FootballError } from "../errors";
import type { ProviderPageRequest } from "../provider/contracts";
import type {
  FootballIngestionJob,
  IngestionCounts,
  IngestionDependencies,
  IngestionRunContext,
} from "./contracts";

type ProviderMethod = keyof Pick<
  IngestionDependencies["provider"],
  | "listCompetitions"
  | "listSeasons"
  | "listRounds"
  | "listTeams"
  | "listPlayers"
  | "listSquads"
  | "listFixtures"
  | "listStandings"
  | "listLineups"
  | "listMatchEvents"
  | "listMatchStatistics"
  | "listAvailability"
>;

const METHOD_BY_JOB: Record<FootballIngestionJob, ProviderMethod> = {
  competitions: "listCompetitions",
  seasons: "listSeasons",
  rounds: "listRounds",
  teams: "listTeams",
  players: "listPlayers",
  squads: "listSquads",
  fixtures: "listFixtures",
  standings: "listStandings",
  lineups: "listLineups",
  match_events: "listMatchEvents",
  match_statistics: "listMatchStatistics",
  player_availability: "listAvailability",
};

function emptyCounts(): IngestionCounts {
  return { fetched: 0, validated: 0, inserted: 0, updated: 0, skipped: 0, rejected: 0, retries: 0 };
}

export async function runFootballIngestionJob(
  job: FootballIngestionJob,
  dependencies: IngestionDependencies,
  checkpoint: string | null = null,
): Promise<IngestionCounts> {
  if (dependencies.pageSize < 1 || dependencies.pageSize > 500 || dependencies.maxPages < 1) {
    throw new FootballError(
      "invalid_provider_payload",
      "The ingestion pagination policy is invalid.",
    );
  }
  const runId = await dependencies.persistence.begin(dependencies.provider.name, job, checkpoint);
  const context: IngestionRunContext = {
    runId,
    provider: dependencies.provider.name,
    job,
    signal: dependencies.signal,
  };
  const counts = emptyCounts();
  let cursor = checkpoint;
  try {
    for (let pageNumber = 0; pageNumber < dependencies.maxPages; pageNumber += 1) {
      if (dependencies.signal?.aborted) throw new DOMException("Aborted", "AbortError");
      const request: ProviderPageRequest = {
        cursor,
        limit: dependencies.pageSize,
        signal: dependencies.signal,
      };
      const method = METHOD_BY_JOB[job];
      const response = await (
        dependencies.provider[method] as (
          input: ProviderPageRequest,
        ) => Promise<{ items: readonly unknown[]; nextCursor: string | null }>
      )(request);
      counts.fetched += response.items.length;
      for (const item of response.items) {
        try {
          counts.validated += 1;
          const outcome = await dependencies.persistence.upsert(job, item, context);
          counts[outcome] += 1;
        } catch (error) {
          counts.rejected += 1;
          await dependencies.persistence.reject(item, error, context);
        }
      }
      cursor = response.nextCursor;
      if (!cursor) {
        await dependencies.persistence.complete(context, counts, null);
        return counts;
      }
    }
    throw new FootballError("partial_sync_failure", "The ingestion page budget was exhausted.");
  } catch (error) {
    await dependencies.persistence.fail(context, counts, error, cursor);
    throw error;
  }
}

export class FootballIngestionEngine {
  constructor(private readonly dependencies: IngestionDependencies) {}
  syncCompetitions(cursor?: string | null) {
    return runFootballIngestionJob("competitions", this.dependencies, cursor);
  }
  syncSeasons(cursor?: string | null) {
    return runFootballIngestionJob("seasons", this.dependencies, cursor);
  }
  syncRounds(cursor?: string | null) {
    return runFootballIngestionJob("rounds", this.dependencies, cursor);
  }
  syncTeams(cursor?: string | null) {
    return runFootballIngestionJob("teams", this.dependencies, cursor);
  }
  syncPlayers(cursor?: string | null) {
    return runFootballIngestionJob("players", this.dependencies, cursor);
  }
  syncSquads(cursor?: string | null) {
    return runFootballIngestionJob("squads", this.dependencies, cursor);
  }
  syncFixtures(cursor?: string | null) {
    return runFootballIngestionJob("fixtures", this.dependencies, cursor);
  }
  syncStandings(cursor?: string | null) {
    return runFootballIngestionJob("standings", this.dependencies, cursor);
  }
  syncLineups(cursor?: string | null) {
    return runFootballIngestionJob("lineups", this.dependencies, cursor);
  }
  syncMatchEvents(cursor?: string | null) {
    return runFootballIngestionJob("match_events", this.dependencies, cursor);
  }
  syncMatchStatistics(cursor?: string | null) {
    return runFootballIngestionJob("match_statistics", this.dependencies, cursor);
  }
  syncPlayerAvailability(cursor?: string | null) {
    return runFootballIngestionJob("player_availability", this.dependencies, cursor);
  }
}
