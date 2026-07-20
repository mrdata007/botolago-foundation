import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/backend/generated/database.types";
import { FootballError, mapFootballError } from "../errors";
import type { ProviderFixture } from "../provider/contracts";
import type {
  FootballIngestionJob,
  IngestionCounts,
  IngestionPersistence,
  IngestionRunContext,
} from "./contracts";

function serverClient(): SupabaseClient<Database> {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new FootballError("data_unavailable", "Server Football credentials are not configured.");
  }
  return createClient<Database>(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

async function sha256(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function stableCode(error: unknown): string {
  return mapFootballError(error).code;
}

const rejectionEntityByJob: Record<FootballIngestionJob, string> = {
  competitions: "competition",
  seasons: "season",
  rounds: "round",
  teams: "team",
  squads: "team",
  players: "player",
  fixtures: "fixture",
  standings: "competition",
  lineups: "fixture",
  match_events: "event",
  match_statistics: "fixture",
  player_availability: "player",
};

export class SupabaseFootballIngestionGateway implements IngestionPersistence {
  private readonly client: SupabaseClient<Database>;
  constructor(client: SupabaseClient<Database> = serverClient()) {
    this.client = client;
  }

  async begin(
    provider: string,
    job: FootballIngestionJob,
    checkpoint: string | null,
  ): Promise<string> {
    const { data, error } = await this.client.schema("api").rpc("begin_football_ingestion", {
      p_provider_name: provider,
      p_job_type: job,
      p_checkpoint: checkpoint ? { cursor: checkpoint } : {},
      p_target_scope: {},
    });
    if (error) throw mapFootballError(error);
    return data;
  }

  private async resolve(provider: string, entityType: string, externalId: string): Promise<string> {
    const { data, error } = await this.client.schema("api").rpc("resolve_football_mapping", {
      p_provider_name: provider,
      p_entity_type: entityType,
      p_external_id: externalId,
    });
    if (error) throw mapFootballError(error);
    return data;
  }

  async upsert(
    job: FootballIngestionJob,
    item: unknown,
    context: IngestionRunContext,
  ): Promise<"inserted" | "updated" | "skipped"> {
    if (job !== "fixtures") {
      throw new FootballError(
        "data_unavailable",
        `Trusted persistence for ${job} is disabled until a production provider is selected.`,
      );
    }
    const fixture = item as ProviderFixture;
    let outcome: "inserted" | "updated" = "updated";
    try {
      await this.resolve(context.provider, "fixture", fixture.externalId);
    } catch (error) {
      if (mapFootballError(error).code !== "mapping_not_found") throw error;
      outcome = "inserted";
    }
    const [competitionId, seasonId, roundId, homeTeamId, awayTeamId, venueId] = await Promise.all([
      this.resolve(context.provider, "competition", fixture.competitionExternalId),
      this.resolve(context.provider, "season", fixture.seasonExternalId),
      fixture.roundExternalId
        ? this.resolve(context.provider, "round", fixture.roundExternalId)
        : Promise.resolve(null),
      this.resolve(context.provider, "team", fixture.homeTeamExternalId),
      this.resolve(context.provider, "team", fixture.awayTeamExternalId),
      fixture.venueExternalId
        ? this.resolve(context.provider, "venue", fixture.venueExternalId)
        : Promise.resolve(null),
    ]);
    const payload: Json = {
      competitionId,
      seasonId,
      roundId,
      homeTeamId,
      awayTeamId,
      venueId,
      kickoffAt: fixture.kickoffAt,
      status: fixture.status,
      period: fixture.period,
      minute: fixture.minute,
      addedTime: fixture.addedTime,
      homeScore: fixture.homeScore,
      awayScore: fixture.awayScore,
      providerUpdatedAt: fixture.freshness.updatedAt,
      sourceSequence: fixture.freshness.sourceSequence,
      sourceVersion: fixture.freshness.sourceVersion,
    };
    const { error } = await this.client.schema("api").rpc("ingest_football_fixture", {
      p_provider_name: context.provider,
      p_external_id: fixture.externalId,
      p_fixture: payload,
    });
    if (error) throw mapFootballError(error);
    return outcome;
  }

  async reject(item: unknown, error: unknown, context: IngestionRunContext): Promise<void> {
    const externalId =
      typeof item === "object" && item !== null && "externalId" in item
        ? String(item.externalId)
        : "unknown";
    const { error: databaseError } = await this.client
      .schema("api")
      .rpc("record_football_ingestion_rejection", {
        p_run_id: context.runId,
        p_entity_type: rejectionEntityByJob[context.job],
        p_external_id: externalId,
        p_payload_fingerprint: await sha256(item),
        p_error_code: stableCode(error),
        p_validation_issues: [{ code: stableCode(error) }],
      });
    if (databaseError) throw mapFootballError(databaseError);
  }

  async complete(
    context: IngestionRunContext,
    counts: IngestionCounts,
    checkpoint: string | null,
  ): Promise<void> {
    await this.finish(context, counts, checkpoint, "succeeded", null);
  }

  async fail(
    context: IngestionRunContext,
    counts: IngestionCounts,
    error: unknown,
    checkpoint: string | null,
  ): Promise<void> {
    await this.finish(
      context,
      counts,
      checkpoint,
      counts.validated > 0 ? "partial" : "failed",
      error,
    );
  }

  private async finish(
    context: IngestionRunContext,
    counts: IngestionCounts,
    checkpoint: string | null,
    status: "succeeded" | "partial" | "failed",
    error: unknown,
  ): Promise<void> {
    const normalized = error ? mapFootballError(error) : null;
    const { error: databaseError } = await this.client
      .schema("api")
      .rpc("complete_football_ingestion", {
        p_run_id: context.runId,
        p_status: status,
        p_checkpoint: checkpoint ? { cursor: checkpoint } : {},
        p_records_fetched: counts.fetched,
        p_records_validated: counts.validated,
        p_records_inserted: counts.inserted,
        p_records_updated: counts.updated,
        p_records_skipped: counts.skipped,
        p_records_rejected: counts.rejected,
        p_retry_count: counts.retries,
        p_error_code: normalized?.code,
        p_error_summary: normalized?.message,
      });
    if (databaseError) throw mapFootballError(databaseError);
  }
}
