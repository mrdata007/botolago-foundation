import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/backend/generated/database.types";
import { mapNewsError, NewsError } from "../errors";
import type { NormalizedNewsArticle } from "../provider/contracts";
import type { NewsIngestionCounters, NewsIngestionGateway } from "./contracts";

function serverClient(): SupabaseClient<Database> {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey)
    throw new NewsError("data_unavailable", "Server News credentials are not configured.");
  return createClient<Database>(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

const rejectionReasons = new Set([
  "invalid_payload",
  "mapping_collision",
  "duplicate_conflict",
  "unsafe_content",
  "unsupported_language",
  "stale_update",
  "source_blocked",
  "rate_limited",
  "provider_unavailable",
]);

function rejectionReason(code: string) {
  if (code === "invalid_provider_payload") return "invalid_payload" as const;
  if (code === "provider_rate_limited") return "rate_limited" as const;
  return rejectionReasons.has(code)
    ? (code as
        | "mapping_collision"
        | "duplicate_conflict"
        | "unsafe_content"
        | "unsupported_language"
        | "stale_update"
        | "source_blocked"
        | "rate_limited"
        | "provider_unavailable")
    : ("invalid_payload" as const);
}

/**
 * Operational gateway for run tracking and quarantine. Canonical provider
 * persistence deliberately fails closed until a production provider and its
 * reviewed mapping policy are selected; Phase 4 does not pretend fixture data
 * is a live editorial source.
 */
export class SupabaseNewsIngestionGateway implements NewsIngestionGateway {
  constructor(
    private readonly publisherId: string,
    private readonly client: SupabaseClient<Database> = serverClient(),
  ) {}

  async begin(_providerName: string, jobType: string, cursor: string | null): Promise<string> {
    const { data, error } = await this.client.schema("api").rpc("news_begin_ingestion_run", {
      p_publisher_id: this.publisherId,
      p_job_type: jobType,
      p_cursor: cursor ?? undefined,
      p_target_scope: "all",
    });
    if (error) throw mapNewsError(error);
    return data;
  }

  async persist(
    _runId: string,
    _providerName: string,
    _article: NormalizedNewsArticle,
  ): Promise<"inserted" | "updated" | "skipped"> {
    throw new NewsError(
      "data_unavailable",
      "Canonical News provider persistence is disabled until a production provider is approved.",
    );
  }

  async reject(
    runId: string,
    externalId: string | null,
    code: string,
    summary: string,
  ): Promise<void> {
    const { error } = await this.client.schema("api").rpc("news_record_ingestion_rejection", {
      p_run_id: runId,
      p_external_id: externalId ?? "",
      p_reason: rejectionReason(code),
      p_error_code: code,
      p_sanitized_summary: summary,
    });
    if (error) throw mapNewsError(error);
  }

  async complete(
    runId: string,
    status: "succeeded" | "partially_succeeded" | "failed",
    cursor: string | null,
    counters: NewsIngestionCounters,
  ): Promise<void> {
    const { error } = await this.client.schema("api").rpc("news_complete_ingestion_run", {
      p_run_id: runId,
      p_status: status,
      p_cursor: cursor ?? "",
      p_fetched: counters.fetched,
      p_validated: counters.validated,
      p_inserted: counters.inserted,
      p_updated: counters.updated,
      p_skipped: counters.skipped,
      p_rejected: counters.rejected,
      p_error_code: status === "failed" ? "partial_sync_failure" : undefined,
      p_error_summary:
        status === "failed" ? "News ingestion failed; inspect correlated server logs." : undefined,
    });
    if (error) throw mapNewsError(error);
  }
}
