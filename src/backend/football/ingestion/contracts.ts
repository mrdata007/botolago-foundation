import type { FootballProvider } from "../provider/contracts";

export const FOOTBALL_INGESTION_JOBS = [
  "competitions",
  "seasons",
  "rounds",
  "teams",
  "players",
  "squads",
  "fixtures",
  "standings",
  "lineups",
  "match_events",
  "match_statistics",
  "player_availability",
] as const;
export type FootballIngestionJob = (typeof FOOTBALL_INGESTION_JOBS)[number];

export interface IngestionCounts {
  fetched: number;
  validated: number;
  inserted: number;
  updated: number;
  skipped: number;
  rejected: number;
  retries: number;
}

export interface IngestionRunContext {
  readonly runId: string;
  readonly provider: string;
  readonly job: FootballIngestionJob;
  readonly signal?: AbortSignal;
}

export interface IngestionPersistence {
  begin(provider: string, job: FootballIngestionJob, checkpoint: string | null): Promise<string>;
  upsert(
    job: FootballIngestionJob,
    item: unknown,
    context: IngestionRunContext,
  ): Promise<"inserted" | "updated" | "skipped">;
  reject(item: unknown, error: unknown, context: IngestionRunContext): Promise<void>;
  complete(
    context: IngestionRunContext,
    counts: IngestionCounts,
    checkpoint: string | null,
  ): Promise<void>;
  fail(
    context: IngestionRunContext,
    counts: IngestionCounts,
    error: unknown,
    checkpoint: string | null,
  ): Promise<void>;
}

export interface IngestionDependencies {
  readonly provider: FootballProvider;
  readonly persistence: IngestionPersistence;
  readonly pageSize: number;
  readonly maxPages: number;
  readonly signal?: AbortSignal;
}
