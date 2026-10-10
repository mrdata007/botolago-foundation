/**
 * Reconciled scoring ingestion, STAGING ONLY
 * (docs/backend/RECONCILED_SCORING_INGESTION.md).
 *
 *   bun scripts/backend/reconciled-scoring-ingestion.ts \
 *     --plan plan.json --mappings rows.json --captured-at <ISO> \
 *     [--mode local|dry-run|record] [--source committed|live] [--out report.json]
 *
 * `plan.json`: `[{ "sofascoreId", "flashscoreId", "appFixtureId", "homeTeamId", "awayTeamId" }]`,
 * the provider match pair and the app fixture it is, reviewed by a person.
 * `rows.json`: the output of `scripts/backend/football-reviewed-mapping-snapshot.sql`
 * read from the SAME database the run writes to.
 *
 * Provider data (`--source`):
 * - `committed` (default): the committed historical payloads (tests/fixtures/providers).
 *   No provider call.
 * - `live`: downloads each match from Sofascore and Flashscore through the approved
 *   adapters, 8 requests per match against the monthly quotas. Needs `RAPIDAPI_KEY` and
 *   `FLASHSCORE_RAPIDAPI_HOST`. `--observed-at` defaults to now. Works in every mode
 *   (a live `local` run writes nothing). The staging-only rule below still applies to
 *   the database modes; it is not relaxed.
 *
 * Modes:
 * - `local` (default): no database at all. Builds and checks each request, says
 *   which matches are blocked and why.
 * - `dry-run`: sends each ready request with `p_dry_run = true`. Every database
 *   guard runs; the database keeps nothing.
 * - `record`: writes. Needs `RECONCILED_INGESTION_CONFIRMATION=RECORD_RECONCILED_OBSERVATIONS_ON_STAGING`.
 *
 * Both database modes need `SUPABASE_URL` and `SUPABASE_SECRET_KEY` and refuse the
 * production project outright. Exit code: 0 all good, 2 a match is blocked or a
 * reviewed correction is in force, 3 an outcome is uncertain (running again is
 * safe), 4 the database refused.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";
import { loadCommittedMatch } from "../../src/backend/fantasy/provider-replay-fixtures";
import {
  ingestReconciledFixtures,
  prepareReconciledObservation,
  SupabaseReconciledObservationGateway,
  type FixtureBinding,
  type IngestionMode,
  type IngestionReport,
  type PreparedObservation,
} from "../../src/backend/fantasy/reconciled-ingestion";
import {
  buildReviewedIdentitySnapshot,
  type MappingRowInput,
} from "../../src/backend/fantasy/reviewed-identities";
import type { ProviderMatchData } from "../../src/backend/fantasy/provider-reconciler";
import {
  createFlashscorePerformanceProvider,
  createSofascorePerformanceProvider,
} from "../../src/backend/football/provider/rapidapi-config.server";
import { rowsFromSql } from "./replay-provider-fixtures";

export const PRODUCTION_PROJECT_REF = "tkewgajrljbwgwedqsxn";
export const RECORD_CONFIRMATION = "RECORD_RECONCILED_OBSERVATIONS_ON_STAGING";

export interface PlanEntry extends FixtureBinding {
  readonly sofascoreId: string;
  readonly flashscoreId: string;
}

export type CliMode = "local" | IngestionMode;

/** Refuses anything but a staging write that was asked for in so many words. */
export function databaseGuard(
  mode: CliMode,
  env: Record<string, string | undefined>,
): { url: string; secret: string } | null {
  if (mode === "local") return null;
  const url = (env.SUPABASE_URL ?? "").replace(/\/$/, "");
  const secret = env.SUPABASE_SECRET_KEY ?? "";
  if (
    !/^https:\/\/[a-z0-9]{20}\.supabase\.co$/.test(url) &&
    !/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(url)
  )
    throw new Error(
      "reconciled_ingestion_url_invalid: SUPABASE_URL must be a Supabase project or local stack URL",
    );
  if (url.includes(PRODUCTION_PROJECT_REF))
    throw new Error("reconciled_ingestion_production_refused: this tool runs on staging only");
  if (!secret)
    throw new Error("reconciled_ingestion_secret_missing: SUPABASE_SECRET_KEY is required");
  if (mode === "record" && env.RECONCILED_INGESTION_CONFIRMATION !== RECORD_CONFIRMATION)
    throw new Error(
      `reconciled_ingestion_confirmation_missing: set RECONCILED_INGESTION_CONFIRMATION=${RECORD_CONFIRMATION}`,
    );
  return { url, secret };
}

export function parsePlan(value: unknown): PlanEntry[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 20)
    throw new Error("reconciled_ingestion_plan_invalid: 1 to 20 entries");
  const keys = new Set<string>();
  return value.map((entry, i) => {
    const e = entry as Record<string, unknown>;
    for (const field of [
      "sofascoreId",
      "flashscoreId",
      "appFixtureId",
      "homeTeamId",
      "awayTeamId",
    ]) {
      if (typeof e[field] !== "string" || (e[field] as string).length === 0)
        throw new Error(`reconciled_ingestion_plan_invalid: entry ${i} needs ${field}`);
    }
    for (const key of [`s:${e.sofascoreId}`, `f:${e.flashscoreId}`, `a:${e.appFixtureId}`]) {
      if (keys.has(key)) throw new Error(`reconciled_ingestion_plan_invalid: ${key} appears twice`);
      keys.add(key);
    }
    return e as unknown as PlanEntry;
  });
}

export function exitCodeOf(
  report: IngestionReport | null,
  prepared: readonly PreparedObservation[],
): 0 | 2 | 3 | 4 {
  const statuses = report
    ? report.fixtures.map((f) => f.outcome.status)
    : prepared.map((p) => (p.request ? "ready" : "blocked"));
  if (statuses.includes("refused") || statuses.includes("not-attempted")) return 4;
  if (statuses.includes("uncertain")) return 3;
  if (statuses.includes("blocked") || statuses.includes("reviewed-correction-in-force")) return 2;
  return 0;
}

export type MatchSource = "committed" | "live";

/** Both providers' data for one planned match, from the committed files or a live download. */
export async function loadPlannedMatch(
  source: MatchSource,
  entry: Pick<PlanEntry, "sofascoreId" | "flashscoreId">,
  env: Record<string, string | undefined> = process.env,
): Promise<{ sofascore: ProviderMatchData; flashscore: ProviderMatchData }> {
  return createPlannedMatchLoader(source, env).load(entry);
}

/** One pair of clients per batch: quota state survives across match boundaries. */
export function createPlannedMatchLoader(
  source: MatchSource,
  env: Record<string, string | undefined> = process.env,
) {
  if (source === "committed")
    return {
      load: async (entry: Pick<PlanEntry, "sofascoreId" | "flashscoreId">) =>
        loadCommittedMatch(entry),
      usage: () => null,
    };
  // Build both providers first, so a missing setting fails before any quota is spent.
  const sofascoreProvider = createSofascorePerformanceProvider(env);
  const flashscoreProvider = createFlashscorePerformanceProvider(env);
  return {
    load: async (entry: Pick<PlanEntry, "sofascoreId" | "flashscoreId">) => {
      const sofascore = await sofascoreProvider.getMatch(entry.sofascoreId);
      const flashscore = await flashscoreProvider.getMatch(entry.flashscoreId);
      return { sofascore, flashscore };
    },
    usage: () => ({ sofascore: sofascoreProvider.usage(), flashscore: flashscoreProvider.usage() }),
  };
}

const arg = (name: string) => {
  const at = process.argv.indexOf(name);
  return at >= 0 ? process.argv[at + 1] : undefined;
};

async function main() {
  const mode = (arg("--mode") ?? "local") as CliMode;
  if (!["local", "dry-run", "record"].includes(mode))
    throw new Error("--mode must be local, dry-run or record");
  const db = databaseGuard(mode, process.env);
  const planFile = arg("--plan");
  const mappingsFile = arg("--mappings");
  const capturedAt = arg("--captured-at");
  if (!planFile || !mappingsFile || !capturedAt)
    throw new Error("--plan, --mappings and --captured-at are required");
  const plan = parsePlan(JSON.parse(readFileSync(planFile, "utf8")));
  const parsed = JSON.parse(readFileSync(mappingsFile, "utf8"));
  const rows: MappingRowInput[] = Array.isArray(parsed) ? rowsFromSql(parsed) : parsed.rows;
  const snapshot = await buildReviewedIdentitySnapshot(rows, capturedAt);
  const source = (arg("--source") ?? "committed") as MatchSource;
  if (!["committed", "live"].includes(source))
    throw new Error("--source must be committed or live");
  const observedAt =
    arg("--observed-at") ??
    (source === "live" ? new Date().toISOString() : "2026-10-01T12:00:00.000Z");

  const loader = createPlannedMatchLoader(source);
  const prepared: PreparedObservation[] = [];
  for (const entry of plan) {
    prepared.push(
      await prepareReconciledObservation({
        observedAt,
        snapshot,
        binding: entry,
        ...(await loader.load(entry)),
      }),
    );
    for (const [provider, usage] of Object.entries(loader.usage() ?? {})) {
      if (usage.remaining !== null && usage.limit !== null && usage.remaining <= usage.limit * 0.2)
        console.warn(
          `PROVIDER_QUOTA_LOW ${provider}: ${usage.remaining}/${usage.limit} requests remaining`,
        );
    }
  }
  const report = db
    ? await ingestReconciledFixtures(prepared, {
        mode: mode as IngestionMode,
        gateway: new SupabaseReconciledObservationGateway(
          createClient(db.url, db.secret, {
            auth: { persistSession: false, autoRefreshToken: false },
          }) as never,
        ),
      })
    : null;
  const evidence = {
    mode,
    providerUsage: loader.usage(),
    providerData:
      source === "live"
        ? "live download through the approved adapters"
        : "committed historical payloads (no provider call)",
    snapshot: {
      digest: snapshot.digest,
      capturedAt: snapshot.capturedAt,
      entries: snapshot.entries.length,
    },
    prepared: prepared.map((p) => ({
      sofascoreEventId: p.sofascoreEventId,
      flashscoreEventId: p.flashscoreEventId,
      appFixtureId: p.appFixtureId,
      mode: p.mode,
      stages: p.stages,
      ready: p.request !== null,
      requestDigest: p.requestDigest,
      players: p.request?.payload.players.length ?? 0,
      blockers: p.blockers,
    })),
    report,
  };
  const text = JSON.stringify(evidence, null, 2);
  if (arg("--out")) writeFileSync(arg("--out") as string, text);
  else console.log(text);
  process.exitCode = exitCodeOf(report, prepared);
}

if (import.meta.main) await main();
