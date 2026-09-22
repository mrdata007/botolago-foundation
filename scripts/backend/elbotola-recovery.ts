import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  handleElbotolaRequest,
  type ElbotolaRpcClient,
} from "../../supabase/functions/_shared/elbotola";

type Row = Record<string, unknown>;
const PROJECT = "tkewgajrljbwgwedqsxn";
const REPOSITORY = "mrdata007/botolago-foundation";
const WORKFLOW = ".github/workflows/news-elbotola-recovery.yml";
const VERIFIED_FILES = [
  WORKFLOW,
  "scripts/backend/elbotola-recovery.ts",
  "supabase/functions/_shared/elbotola.ts",
  "supabase/migrations/20260914185233_elbotola_service_source_controls.sql",
  "package.json",
  "bun.lock",
];
const COUNTERS = [
  "fetched",
  "validated",
  "inserted",
  "updated",
  "skipped",
  "rejected",
  "retries",
] as const;
type Counters = Record<(typeof COUNTERS)[number], number>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class ElbotolaRecoveryError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
function fail(code: string): never {
  throw new ElbotolaRecoveryError(code);
}
function row(value: unknown): Row {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("invalid_recovery_payload");
  return value as Row;
}

export function runtimeGuard(env: NodeJS.ProcessEnv) {
  if (
    env.GITHUB_REPOSITORY !== REPOSITORY ||
    env.GITHUB_REF !== "refs/heads/main" ||
    env.GITHUB_RUN_ATTEMPT !== "1" ||
    !/^[a-f0-9]{40}$/.test(env.EXPECTED_COMMIT ?? "") ||
    env.EXPECTED_COMMIT !== env.GITHUB_SHA ||
    env.CONFIRMATION !== "RUN_ELBOTOLA_RECOVERY"
  )
    fail("immutable_target_guard_failed");
  const mode = env.ELBOTOLA_RECOVERY_MODE;
  if (env.GITHUB_EVENT_NAME === "workflow_dispatch") {
    if (env.GITHUB_ACTOR !== "mrdata007" || (mode !== "canary" && mode !== "refresh"))
      fail("owner_dispatch_required");
  } else if (
    env.GITHUB_EVENT_NAME !== "schedule" ||
    mode !== "refresh" ||
    env.ELBOTOLA_SCHEDULE_ENABLED !== "true"
  ) {
    fail("schedule_not_enabled");
  }
  const url = env.SUPABASE_PRODUCTION_URL?.replace(/\/$/, "");
  if (
    env.SUPABASE_PRODUCTION_PROJECT_REF !== PROJECT ||
    env.SUPABASE_PRODUCTION_PROJECT_NAME !== "BotolaGO Production V2" ||
    url !== `https://${PROJECT}.supabase.co`
  )
    fail("production_target_mismatch");
  if (!env.SUPABASE_SECRET_KEY || /\s/.test(env.SUPABASE_SECRET_KEY))
    fail("protected_service_key_missing");
  if (
    !env.SUPABASE_PRODUCTION_PUBLISHABLE_KEY?.startsWith("sb_publishable_") ||
    /\s/.test(env.SUPABASE_PRODUCTION_PUBLISHABLE_KEY)
  )
    fail("protected_publishable_key_missing");
  return {
    mode: mode as "canary" | "refresh",
    commit: env.EXPECTED_COMMIT!,
    url,
    key: env.SUPABASE_SECRET_KEY,
    publishableKey: env.SUPABASE_PRODUCTION_PUBLISHABLE_KEY,
  };
}

export function createRecoveryClients(
  config: ReturnType<typeof runtimeGuard>,
  fetcher?: typeof fetch,
) {
  const options = {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: fetcher ? { fetch: fetcher } : undefined,
  };
  return {
    writer: createClient(config.url, config.key, options),
    reader: createClient(config.url, config.publishableKey, options),
  };
}

export function validateCanaryRun(value: unknown): string {
  const run = row(value);
  if (
    run.path !== WORKFLOW ||
    run.event !== "workflow_dispatch" ||
    run.conclusion !== "success" ||
    run.head_branch !== "main" ||
    run.run_attempt !== 1 ||
    row(run.repository ?? {}).full_name !== REPOSITORY ||
    row(run.actor ?? {}).login !== "mrdata007" ||
    typeof run.head_sha !== "string" ||
    !/^[a-f0-9]{40}$/.test(run.head_sha)
  )
    fail("verified_manual_canary_required");
  return run.head_sha;
}

async function verifyPriorCanary(env: NodeJS.ProcessEnv): Promise<Row> {
  const runId = env.ELBOTOLA_CANARY_VERIFIED_RUN_ID ?? "";
  if (!/^[1-9]\d*$/.test(runId) || !env.GITHUB_TOKEN) fail("verified_manual_canary_required");
  const request = async (path: string): Promise<Row> => {
    const response = await fetch(`https://api.github.com/repos/${REPOSITORY}/${path}`, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
      redirect: "error",
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) fail("canary_evidence_unavailable");
    const text = await response.text();
    if (text.length > 2_000_000) fail("canary_evidence_too_large");
    return row(JSON.parse(text));
  };
  const commit = validateCanaryRun(await request(`actions/runs/${runId}`));
  const jobs = await request(`actions/runs/${runId}/jobs?per_page=100`);
  if (
    !Array.isArray(jobs.jobs) ||
    !jobs.jobs.some((job) => {
      const steps = row(job).steps;
      return (
        Array.isArray(steps) &&
        steps.some(
          (step) =>
            row(step).name === "Confirm manual ElBotola canary completed" &&
            row(step).conclusion === "success",
        )
      );
    })
  )
    fail("verified_manual_canary_steps_required");
  for (const filename of VERIFIED_FILES) {
    const previous = await request(`contents/${filename}?ref=${commit}`);
    if (
      previous.encoding !== "base64" ||
      typeof previous.content !== "string" ||
      !Buffer.from(previous.content, "base64").equals(await readFile(filename))
    )
      fail("ingestion_implementation_changed_recanary_required");
  }
  return { runId, commit, implementationUnchanged: true };
}

export function validateCounters(value: unknown): Counters {
  const response = row(value);
  if (response.provider !== "elbotola" || JSON.stringify(response.languages) !== '["ar"]')
    fail("unexpected_ingestion_response");
  const counters = row(response.counters);
  for (const name of COUNTERS) {
    if (
      typeof counters[name] !== "number" ||
      !Number.isSafeInteger(counters[name]) ||
      counters[name] < 0
    )
      fail("invalid_ingestion_counters");
  }
  const result = counters as Counters;
  if (
    result.fetched < 1 ||
    result.fetched > 10 ||
    result.rejected !== 0 ||
    result.validated !== result.fetched ||
    result.inserted + result.updated + result.skipped !== result.fetched
  )
    fail("ingestion_reconciliation_failed");
  return result;
}

export interface ObservedArticle {
  id: string;
  canonicalUrl: string;
  publishedAt: string;
}
/**
 * BG-0073 News stand-down.
 *
 * Ingestion no longer publishes: api.news_ingest_provider_article lands every
 * edition as draft/private, so an ingested article is deliberately NOT reachable
 * through the public feed. This check is therefore the inverse of what it used
 * to be - it proves the stand-down holds, that a scheduled or dispatched run
 * still cannot put third-party link-outs in front of a reader.
 *
 * The freshness gate is kept, but it is now measured against the provider
 * publication timestamps we actually observed being persisted rather than
 * against the public feed, which is empty by design. That is the check's real
 * purpose: proving the provider is handing us current content.
 */
export function validateStandDownFeed(value: unknown, articles: ObservedArticle[], now: Date): Row {
  const feed = row(value);
  if (
    !Array.isArray(feed.items) ||
    articles.length < 1 ||
    new Set(articles.map((article) => article.id)).size !== articles.length
  )
    fail("public_feed_reconciliation_failed");
  const items = feed.items.map(row);
  const ingested = new Set(articles.map((article) => article.id));
  if (items.some((item) => typeof item.id === "string" && ingested.has(item.id)))
    fail("ingested_article_public_after_stand_down");
  let latest = 0;
  for (const article of articles) {
    const published = Date.parse(article.publishedAt);
    if (!Number.isFinite(published)) fail("public_feed_reconciliation_failed");
    latest = Math.max(latest, published);
  }
  if (
    !Number.isFinite(latest) ||
    latest < now.getTime() - 48 * 60 * 60 * 1_000 ||
    latest > now.getTime() + 5 * 60 * 1_000
  )
    fail("news_still_stale");
  return {
    ingestedArticles: articles.length,
    publicFeedItems: items.length,
    reachableAfterStandDown: 0,
    latestIngestedPublication: new Date(latest).toISOString(),
  };
}

export function observedClient(
  client: ElbotolaRpcClient,
  evidence: Row,
  articles: ObservedArticle[],
): ElbotolaRpcClient {
  return {
    schema: () => ({
      rpc: async (name, args) => {
        const result = await client.schema("api").rpc(name, args);
        if (result.error) return result;
        if (name === "news_begin_provider_ingestion") {
          const runId = row(result.data).runId;
          if (typeof runId !== "string" || !UUID.test(runId)) fail("invalid_ingestion_run_id");
          evidence.ingestionRunId = runId;
        } else if (name === "news_ingest_provider_article") {
          const id = row(result.data).articleId;
          if (typeof id !== "string" || !UUID.test(id)) fail("invalid_ingested_article_id");
          articles.push({
            id,
            canonicalUrl: String(args.p_canonical_url),
            publishedAt: String(args.p_source_published_at),
          });
        } else if (name === "news_complete_ingestion_run") {
          evidence.databaseCompletion = {
            status: args.p_status,
            runId: args.p_run_id,
            counters: Object.fromEntries(
              COUNTERS.filter((name) => name !== "retries").map((name) => [
                name,
                args[`p_${name}`],
              ]),
            ),
          };
        }
        return result;
      },
    }),
  };
}

export async function prepareSource(
  client: ElbotolaRpcClient,
  mode: "canary" | "refresh",
): Promise<boolean> {
  const status = await client.schema("api").rpc("service_elbotola_source_status", {});
  if (status.error) fail("elbotola_source_status_unavailable");
  const source = row(status.data);
  if (
    typeof source.active !== "boolean" ||
    !["trusted", "review_required"].includes(String(source.trustStatus)) ||
    !["https://www.elbotola.com", "https://www.elbotola.com/"].includes(String(source.websiteUrl))
  )
    fail("elbotola_source_blocked");
  if (mode === "refresh" && !source.active) fail("elbotola_source_not_active");
  return source.active;
}

async function main(): Promise<void> {
  const config = runtimeGuard(process.env);
  const directory = resolve(
    process.env.ELBOTOLA_RECOVERY_DIR ?? fail("missing_evidence_directory"),
    "evidence",
  );
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const trigger = randomBytes(32).toString("hex");
  if (process.env.GITHUB_ACTIONS === "true") console.log(`::add-mask::${trigger}`);
  const evidence: Row = {
    schemaVersion: 2,
    expectedCommit: config.commit,
    projectRef: PROJECT,
    runId: process.env.GITHUB_RUN_ID,
    mode: config.mode,
    provider: "elbotola",
    languages: ["ar"],
    permissionReference: "owner-confirmed-2026-08-03-link-metadata-and-remote-hero",
    verdict: "in_progress",
  };
  const { writer: database, reader: publicDatabase } = createRecoveryClients(config);
  let previousActive: boolean | null = null;
  let activatedFromInactive = false;
  const save = async () => {
    const text = JSON.stringify(evidence, null, 2) + "\n";
    if (
      [config.key, config.publishableKey, trigger, process.env.GITHUB_TOKEN].some(
        (secret) => secret && text.includes(secret),
      )
    )
      fail("credential_in_evidence");
    await writeFile(resolve(directory, "result.json"), text, { mode: 0o600 });
  };
  try {
    if (config.mode === "refresh") evidence.verifiedCanary = await verifyPriorCanary(process.env);
    previousActive = await prepareSource(database as unknown as ElbotolaRpcClient, config.mode);
    evidence.previousPublisherActive = previousActive;
    if (config.mode === "canary" && !previousActive) {
      const activation = await database
        .schema("api")
        .rpc("service_set_elbotola_source_active", { p_active: true });
      if (
        activation.error ||
        typeof row(activation.data).previousActive !== "boolean" ||
        row(activation.data).currentActive !== true
      )
        fail("elbotola_source_activation_failed");
      previousActive = row(activation.data).previousActive as boolean;
      activatedFromInactive = previousActive === false;
      evidence.previousPublisherActive = previousActive;
    }
    const articles: ObservedArticle[] = [];
    const client = observedClient(database as unknown as ElbotolaRpcClient, evidence, articles);
    const response = await handleElbotolaRequest(
      new Request(`${config.url}/functions/v1/news-ingest-elbotola`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-botolago-ingestion-key": trigger },
        body: '{"job":"elbotola"}',
      }),
      {
        client,
        environment: {
          ELBOTOLA_INGESTION_TRIGGER_SECRET: trigger,
          ELBOTOLA_SYNDICATION_APPROVED: "true",
          ELBOTOLA_ORIGIN: "https://www.elbotola.com",
          ELBOTOLA_PAGE_SIZE: "10",
          ELBOTOLA_TIMEOUT_MS: "10000",
          ELBOTOLA_MAX_RETRIES: "1",
        },
      },
    );
    const result = row(await response.json());
    if (!response.ok)
      fail(
        typeof result.error === "string" && /^[a-z_]{3,80}$/.test(result.error)
          ? result.error
          : "ingestion_handler_failed",
      );
    const counters = validateCounters(result);
    evidence.counters = counters;
    const completion = row(evidence.databaseCompletion);
    if (
      completion.status !== "succeeded" ||
      completion.runId !== evidence.ingestionRunId ||
      articles.length !== counters.fetched ||
      COUNTERS.some(
        (name) => name !== "retries" && row(completion.counters)[name] !== counters[name],
      )
    )
      fail("database_completion_mismatch");
    const feed = await publicDatabase
      .schema("api")
      .rpc("news_feed", { p_language: "ar", p_limit: 50 });
    if (feed.error) fail("public_feed_unavailable");
    evidence.publicFeed = validateStandDownFeed(feed.data, articles, new Date());
    // BG-0073: an ingested article is draft/private, so api.news_article_detail
    // deliberately refuses to serve it. Confirm that refusal rather than the
    // outbound link, which no public route can show while News is stood down.
    const detail = await publicDatabase
      .schema("api")
      .rpc("news_article_detail", { p_language: "ar", p_identifier: articles[0].id });
    if (!detail.error && row(detail.data ?? {}).id === articles[0].id)
      fail("ingested_article_readable_after_stand_down");
    evidence.verdict = "pass";
    await save();
    console.log("ELBOTOLA_RECOVERY_PASS");
  } catch (error) {
    evidence.verdict = "fail";
    evidence.failureCode =
      error instanceof ElbotolaRecoveryError ? error.code : "elbotola_recovery_failed";
    if (config.mode === "canary" && activatedFromInactive) {
      try {
        const rollback = await database
          .schema("api")
          .rpc("service_set_elbotola_source_active", { p_active: false });
        evidence.publisherRestoredInactive =
          !rollback.error && row(rollback.data).currentActive === false;
      } catch {
        evidence.publisherRestoredInactive = false;
      }
    }
    await save();
    throw new ElbotolaRecoveryError(String(evidence.failureCode));
  }
}

if (import.meta.main)
  main().catch((error) => {
    console.error(error instanceof ElbotolaRecoveryError ? error.code : "elbotola_recovery_failed");
    process.exitCode = 1;
  });
