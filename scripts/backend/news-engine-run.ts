// BotolaGO News Engine operational runner.
//
// One entry point for every mode the engine runs in:
//
//   --job incremental      discovery through publication for due sources
//   --job reconciliation   a wider weekly sweep that catches missed articles
//   --job backfill         controlled historical import
//   --job status           health snapshot, no writes
//
// It follows the house pattern for production-mutating jobs: a runtime guard
// that fails closed before anything is built, a service-role client that must
// agree with the application's project, sanitised evidence written 0600 with a
// credential tripwire, and opaque snake_case failure codes on stderr.
//
// Nothing here is required for routine operation to continue — the scheduler
// invokes this script, and this script is the whole worker. There is no Claude
// Code in the loop.

import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  type NewsEngineLanguage,
  NEWS_ENGINE_LANGUAGES,
  type RunCounters,
  emptyCounters,
} from "@/backend/news-engine/contracts";
import { SupabaseNewsEngineGateway } from "@/backend/news-engine/gateway/supabase-gateway.server";
import { AnthropicNewsModel } from "@/backend/news-engine/llm/anthropic-model.server";
import { DEFAULT_USER_AGENT, NewsHttpClient } from "@/backend/news-engine/fetch/http";
import { RobotsCache } from "@/backend/news-engine/fetch/robots";
import { runPipeline, type PipelineReport } from "@/backend/news-engine/pipeline/run";

export class NewsEngineRunnerError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "NewsEngineRunnerError";
  }
}

function fail(code: string): never {
  throw new NewsEngineRunnerError(code);
}

export type JobKind = "incremental" | "reconciliation" | "backfill" | "status";

export interface RunnerArguments {
  readonly job: JobKind;
  readonly sources: readonly string[];
  readonly languages: readonly NewsEngineLanguage[];
  readonly limit: number;
  readonly dryRun: boolean;
  readonly reviewOnly: boolean;
  readonly publish: boolean;
  readonly since: string | null;
  readonly until: string | null;
  readonly force: boolean;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}(?:T[\d:.]+Z?)?$/u;

/**
 * Parses argv. Defaults are the safe ones: nothing publishes unless `--publish`
 * is passed, and the batch is small unless `--limit` raises it.
 */
export function parseArguments(argv: readonly string[]): RunnerArguments {
  const values = new Map<string, string>();
  const flags = new Set<string>();

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token?.startsWith("--")) continue;
    const equals = token.indexOf("=");
    if (equals !== -1) {
      values.set(token.slice(2, equals), token.slice(equals + 1));
      continue;
    }
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      values.set(token.slice(2), next);
      index += 1;
    } else {
      flags.add(token.slice(2));
    }
  }

  const job = (values.get("job") ?? "incremental") as JobKind;
  if (!["incremental", "reconciliation", "backfill", "status"].includes(job)) {
    fail("invalid_job_kind");
  }

  const sourceValue = values.get("source");
  const sources = sourceValue
    ? sourceValue
        .split(",")
        .map((slug) => slug.trim())
        .filter(Boolean)
    : ["elbotola"];
  for (const slug of sources) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(slug)) fail("invalid_source_slug");
  }

  const languageValue = values.get("language");
  const languages = languageValue
    ? languageValue
        .split(",")
        .map((language) => language.trim())
        .filter(Boolean)
    : [...NEWS_ENGINE_LANGUAGES];
  for (const language of languages) {
    if (!(NEWS_ENGINE_LANGUAGES as readonly string[]).includes(language)) fail("invalid_language");
  }

  const limitValue = values.get("limit");
  const limit = limitValue === undefined ? 25 : Number(limitValue);
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) fail("invalid_limit");

  const since = values.get("since") ?? null;
  const until = values.get("until") ?? null;
  if (since && !ISO_DATE.test(since)) fail("invalid_since");
  if (until && !ISO_DATE.test(until)) fail("invalid_until");

  const publish = flags.has("publish");
  const reviewOnly = flags.has("review-only");
  if (publish && reviewOnly) fail("publish_and_review_only_conflict");

  return {
    job,
    sources,
    languages: languages as NewsEngineLanguage[],
    limit,
    dryRun: flags.has("dry-run"),
    reviewOnly,
    publish,
    since,
    until,
    force: flags.has("force"),
  };
}

export interface RuntimeConfiguration {
  readonly supabaseUrl: string;
  readonly projectRef: string;
  readonly evidenceDirectory: string | null;
  readonly runId: string | null;
  readonly isCi: boolean;
}

/**
 * Fails closed before any client is constructed.
 *
 * The project-ref check is the important one: a service-role worker pointed at
 * the wrong project does not error, it writes real articles into a database
 * nobody is reading.
 */
export function runtimeGuard(
  environment: Readonly<Record<string, string | undefined>>,
): RuntimeConfiguration {
  const url = (environment.SUPABASE_URL ?? environment.VITE_SUPABASE_URL ?? "")
    .trim()
    .replace(/\/+$/u, "");
  if (!url || !/^https:\/\/[a-z0-9]+\.supabase\.co$/u.test(url)) fail("invalid_supabase_url");

  const key = environment.SUPABASE_SECRET_KEY ?? environment.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!key.trim() || /\s/u.test(key)) fail("protected_service_key_missing");

  const projectRef = url.slice("https://".length, url.indexOf(".supabase.co"));
  const expectedRef = environment.NEWS_ENGINE_EXPECTED_PROJECT_REF?.trim();
  if (expectedRef && expectedRef !== projectRef) fail("project_ref_mismatch");

  if (!environment.ANTHROPIC_API_KEY?.trim()) fail("anthropic_api_key_missing");

  return {
    supabaseUrl: url,
    projectRef,
    evidenceDirectory: environment.NEWS_ENGINE_EVIDENCE_DIR?.trim() || null,
    runId: environment.GITHUB_RUN_ID?.trim() || null,
    isCi: environment.GITHUB_ACTIONS === "true",
  };
}

interface Evidence {
  schemaVersion: number;
  job: JobKind;
  projectRef: string;
  runId: string | null;
  startedAt: string;
  completedAt: string | null;
  dryRun: boolean;
  publish: boolean;
  reviewOnly: boolean;
  limit: number;
  languages: readonly string[];
  sources: readonly string[];
  verdict: "in_progress" | "pass" | "fail";
  failureCode: string | null;
  totals: RunCounters;
  perSource: Array<{
    slug: string;
    status: string;
    runId: string | null;
    counters: RunCounters;
    failures: ReadonlyArray<{ stage: string; code: string }>;
    articles: ReadonlyArray<{ language: string; slug: string; published: boolean }>;
    errorCode?: string;
  }>;
  status?: Record<string, unknown>;
}

/** Refuses to write evidence containing anything credential-shaped. */
function assertNoCredentials(serialized: string, secrets: ReadonlyArray<string | undefined>): void {
  for (const secret of secrets) {
    if (secret && secret.length > 8 && serialized.includes(secret)) fail("credential_in_evidence");
  }
  if (/sb_secret_|sbp_|sk-ant-|eyJ[A-Za-z0-9_-]{20,}\./u.test(serialized)) {
    fail("credential_in_evidence");
  }
}

async function saveEvidence(
  configuration: RuntimeConfiguration,
  evidence: Evidence,
  environment: Readonly<Record<string, string | undefined>>,
): Promise<void> {
  if (!configuration.evidenceDirectory) return;
  const directory = resolve(configuration.evidenceDirectory, "evidence");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const serialized = `${JSON.stringify(evidence, null, 2)}\n`;
  assertNoCredentials(serialized, [
    environment.SUPABASE_SECRET_KEY,
    environment.SUPABASE_SERVICE_ROLE_KEY,
    environment.ANTHROPIC_API_KEY,
    environment.GITHUB_TOKEN,
  ]);
  await writeFile(resolve(directory, "result.json"), serialized, { mode: 0o600 });
}

function addCounters(total: RunCounters, addition: RunCounters): void {
  for (const key of Object.keys(total) as Array<keyof RunCounters>) {
    total[key] += addition[key];
  }
}

/** Per-job shape. Reconciliation and backfill widen the window, not the risk. */
function planFor(args: RunnerArguments): {
  triggerKind: "manual" | "schedule" | "reconciliation" | "backfill";
  since: string | null;
  force: boolean;
} {
  if (args.job === "reconciliation") {
    const since =
      args.since ?? new Date(Date.now() - 14 * 24 * 60 * 60 * 1_000).toISOString().slice(0, 10);
    return { triggerKind: "reconciliation", since, force: true };
  }
  if (args.job === "backfill") {
    return { triggerKind: "backfill", since: args.since, force: true };
  }
  return {
    triggerKind: process.env.GITHUB_EVENT_NAME === "schedule" ? "schedule" : "manual",
    since: args.since,
    force: args.force,
  };
}

export async function runNewsEngine(argv: readonly string[]): Promise<number> {
  const args = parseArguments(argv);
  const environment = process.env;
  const configuration = runtimeGuard(environment);

  if (configuration.isCi) {
    for (const secret of [
      environment.SUPABASE_SECRET_KEY,
      environment.SUPABASE_SERVICE_ROLE_KEY,
      environment.ANTHROPIC_API_KEY,
    ]) {
      if (secret) process.stdout.write(`::add-mask::${secret}\n`);
    }
  }

  const gateway = new SupabaseNewsEngineGateway();
  const evidence: Evidence = {
    schemaVersion: 1,
    job: args.job,
    projectRef: configuration.projectRef,
    runId: configuration.runId,
    startedAt: new Date().toISOString(),
    completedAt: null,
    dryRun: args.dryRun,
    publish: args.publish,
    reviewOnly: args.reviewOnly,
    limit: args.limit,
    languages: args.languages,
    sources: args.sources,
    verdict: "in_progress",
    failureCode: null,
    totals: emptyCounters(),
    perSource: [],
  };

  if (args.job === "status") {
    evidence.status = await gateway.status(24);
    evidence.verdict = "pass";
    evidence.completedAt = new Date().toISOString();
    await saveEvidence(configuration, evidence, environment);
    process.stdout.write(`${JSON.stringify(evidence.status, null, 2)}\n`);
    return 0;
  }

  const plan = planFor(args);
  const http = new NewsHttpClient({ userAgent: DEFAULT_USER_AGENT });
  const robots = new RobotsCache(http, DEFAULT_USER_AGENT);
  const model = new AnthropicNewsModel();

  let anyFailed = false;

  for (const slug of args.sources) {
    let report: PipelineReport;
    try {
      report = await runPipeline(
        { gateway, model, http, robots },
        {
          sourceSlug: slug,
          jobType: args.job,
          triggerKind: plan.triggerKind,
          limit: args.limit,
          languages: args.languages,
          dryRun: args.dryRun,
          reviewOnly: args.reviewOnly,
          allowPublish: args.publish,
          since: plan.since,
          until: args.until,
          force: plan.force,
          log: (event, context) => {
            process.stdout.write(`${JSON.stringify({ event, source: slug, ...context })}\n`);
          },
        },
      );
    } catch (error) {
      // One broken source must not end the engine.
      anyFailed = true;
      const code = (error as { code?: string }).code ?? "pipeline_failed";
      evidence.perSource.push({
        slug,
        status: "failed",
        runId: null,
        counters: emptyCounters(),
        failures: [],
        articles: [],
        errorCode: String(code).slice(0, 80),
      });
      process.stderr.write(`${JSON.stringify({ event: "source_failed", source: slug, code })}\n`);
      continue;
    }

    if (report.status === "failed") anyFailed = true;
    addCounters(evidence.totals, report.counters);
    evidence.perSource.push({
      slug,
      status: report.status,
      runId: report.runId,
      counters: report.counters,
      failures: report.failures,
      articles: report.publishedArticles.map((article) => ({
        language: article.language,
        slug: article.slug,
        published: article.published,
      })),
    });
  }

  evidence.verdict = anyFailed ? "fail" : "pass";
  evidence.completedAt = new Date().toISOString();
  await saveEvidence(configuration, evidence, environment);

  process.stdout.write(
    `${JSON.stringify({ event: "news_engine_complete", verdict: evidence.verdict, totals: evidence.totals })}\n`,
  );
  return anyFailed ? 1 : 0;
}

async function main(): Promise<void> {
  try {
    process.exitCode = await runNewsEngine(process.argv.slice(2));
    if (process.exitCode === 0) process.stdout.write("NEWS_ENGINE_PASS\n");
  } catch (error) {
    const code = error instanceof NewsEngineRunnerError ? error.code : "news_engine_runner_failed";
    process.stderr.write(`${code}\n`);
    process.exitCode = 1;
  }
}

if (import.meta.main) {
  await main();
}
