import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

import { runCurrentPerformanceBatch } from "./current-season-performances";
import { runFantasyLifecycle, type FantasyWorkerGateway } from "./fantasy-lifecycle-runner";

/**
 * Scheduled Fantasy season orchestrator.
 *
 * Runs after the provider ingestion step of the same workflow and composes the
 * existing, individually guarded operations into one idempotent pass:
 *
 *   1. `api.service_sync_fantasy_calendar` — stage gameweeks for complete,
 *      confirmed provider rounds; realign assignments, windows and deadlines of
 *      scheduled/open gameweeks; report placeholder kickoffs.
 *   2. finished-fixture performance ingestion (bounded batches, same code path
 *      as the manual workflow).
 *   3. the trusted lifecycle worker (`runFantasyLifecycle`) for every gameweek
 *      that has work: an open gameweek past its deadline, a gameweek that is
 *      locked / live / provisional / finalizing, or a finalized gameweek whose
 *      staged successor has not been opened yet.
 *   4. a second calendar pass so the summary reflects the progression.
 *
 * Every step is idempotent on its own (database idempotency keys, sealed
 * scoring snapshots, progression journal, unique assignment indexes), so
 * re-running this orchestrator on the same provider state is a no-op.
 * Nothing here invents fixtures, kickoffs, results or a season.
 */

const uuid = z.string().uuid();
const status = z.enum([
  "scheduled",
  "open",
  "locked",
  "live",
  "provisional",
  "finalizing",
  "finalized",
  "corrected",
  "cancelled",
]);

export const calendarSyncSchema = z.object({
  schemaVersion: z.literal(1),
  seasonId: uuid,
  seasonStatus: z.string(),
  expectedClubs: z.number().int(),
  gameweeksCreated: z.number().int().min(0),
  assignmentsAdded: z.number().int().min(0),
  assignmentsSuperseded: z.number().int().min(0),
  kickoffsRealigned: z.number().int().min(0),
  deadlineChanges: z.number().int().min(0),
  blockedRounds: z.number().int().min(0),
  rounds: z.array(
    z.object({
      round: z.number().int().nullable(),
      gameweekId: uuid.nullable(),
      status: status.nullable(),
      fixtures: z.number().int(),
      confirmedKickoffs: z.number().int(),
      notes: z.array(z.unknown()),
    }),
  ),
  gameweeks: z.array(
    z.object({
      id: uuid,
      sequence: z.number().int(),
      status,
      deadlineAt: z.string(),
      scoringInputVersion: z.number().int().min(0),
      nextGameweekId: uuid.nullable(),
      advancedToGameweekId: uuid.nullable(),
    }),
  ),
});
export type CalendarSync = z.infer<typeof calendarSyncSchema>;

export interface OrchestratorGateway extends FantasyWorkerGateway {
  /** One bounded finished-fixture performance batch; `null` cursor starts from the beginning. */
  ingestPerformances(afterFixtureExternalId: string | null): Promise<{
    fixturesProcessed: number;
    hasMore: boolean;
    nextCursor: string | null;
  }>;
}

export interface OrchestratorOptions {
  now?: Date;
  maxWorkerRuns?: number;
  maxPerformanceBatches?: number;
  /** Outcome of the provider fixture/result refresh that ran before this pass. */
  providerRefresh?: ProviderRefresh;
}

export type WorkerRun = {
  gameweekId: string;
  sequence: number;
  reason: "deadline_passed" | "in_progress" | "progression_pending";
  calculationVersion: number;
  outcome: string;
  code?: string;
};

/** Gameweeks that need the worker, in sequence order. */
export function selectWorkerTargets(calendar: CalendarSync, now: Date) {
  const targets: Array<{
    gameweekId: string;
    sequence: number;
    reason: WorkerRun["reason"];
    calculationVersion: number;
  }> = [];
  for (const gw of [...calendar.gameweeks].sort((a, b) => a.sequence - b.sequence)) {
    const calculationVersion = gw.scoringInputVersion > 0 ? gw.scoringInputVersion : 1;
    if (["locked", "live", "provisional", "finalizing"].includes(gw.status)) {
      targets.push({
        gameweekId: gw.id,
        sequence: gw.sequence,
        reason: "in_progress",
        calculationVersion,
      });
    } else if (gw.status === "open" && Date.parse(gw.deadlineAt) <= now.getTime()) {
      targets.push({
        gameweekId: gw.id,
        sequence: gw.sequence,
        reason: "deadline_passed",
        calculationVersion,
      });
    } else if (gw.status === "finalized" && gw.nextGameweekId && !gw.advancedToGameweekId) {
      targets.push({
        gameweekId: gw.id,
        sequence: gw.sequence,
        reason: "progression_pending",
        calculationVersion,
      });
    }
  }
  return targets;
}

export async function orchestrateFantasySeason(
  gateway: OrchestratorGateway,
  options: OrchestratorOptions = {},
) {
  const now = options.now ?? new Date();
  const maxWorkerRuns = options.maxWorkerRuns ?? 2;
  const maxPerformanceBatches = options.maxPerformanceBatches ?? 10;
  const workers: WorkerRun[] = [];
  let verdict: "ok" | "waiting" | "failed" = "ok";

  const before = calendarSyncSchema.parse(
    await gateway.rpc("service_sync_fantasy_calendar", { p_fantasy_season_id: null }),
  );

  let cursor: string | null = null;
  let batches = 0;
  let fixturesProcessed = 0;
  let performanceError: string | undefined;
  try {
    do {
      const batch = await gateway.ingestPerformances(cursor);
      batches += 1;
      fixturesProcessed += batch.fixturesProcessed;
      if (!batch.hasMore) break;
      if (!batch.nextCursor || batch.nextCursor === cursor)
        throw new Error("performance_cursor_invalid");
      cursor = batch.nextCursor;
    } while (batches < maxPerformanceBatches);
  } catch (error) {
    performanceError = safeCode(error, "performance_ingestion_failed");
    // Scoring waits for complete statistics by design; the worker below will
    // report `football_not_final` / coverage errors rather than guess.
  }

  const targets = selectWorkerTargets(before, now).slice(0, maxWorkerRuns);
  for (const target of targets) {
    try {
      const result = (await runFantasyLifecycle(gateway, {
        gameweekId: target.gameweekId,
        calculationVersion: target.calculationVersion,
      })) as { outcome?: string; reason?: string };
      workers.push({
        ...target,
        outcome: result.outcome ?? "unknown",
        ...(result.reason ? { code: result.reason } : {}),
      });
      if (result.outcome === "waiting" && verdict === "ok") verdict = "waiting";
    } catch (error) {
      workers.push({
        ...target,
        outcome: "failed",
        code: safeCode(error, "fantasy_worker_failed"),
      });
      verdict = "failed";
      break;
    }
  }

  const after = calendarSyncSchema.parse(
    await gateway.rpc("service_sync_fantasy_calendar", { p_fantasy_season_id: null }),
  );
  if (performanceError && verdict === "ok") verdict = "waiting";
  const providerRefresh = options.providerRefresh;
  // Without a fixture refresh the pass can only work from data already in the
  // database; it is still safe, but never "ok" until the provider is read again.
  if (providerRefresh && !providerRefresh.fixturesRefreshed && verdict === "ok")
    verdict = "waiting";

  return {
    schemaVersion: 1,
    verdict,
    observedAt: now.toISOString(),
    ...(providerRefresh ? { providerRefresh } : {}),
    calendar: {
      seasonId: after.seasonId,
      seasonStatus: after.seasonStatus,
      gameweeksCreated: before.gameweeksCreated + after.gameweeksCreated,
      assignmentsAdded: before.assignmentsAdded + after.assignmentsAdded,
      assignmentsSuperseded: before.assignmentsSuperseded + after.assignmentsSuperseded,
      kickoffsRealigned: before.kickoffsRealigned + after.kickoffsRealigned,
      deadlineChanges: before.deadlineChanges + after.deadlineChanges,
      blockedRounds: after.blockedRounds,
      rounds: after.rounds,
      gameweeks: after.gameweeks.map((gw) => ({
        sequence: gw.sequence,
        status: gw.status,
        deadlineAt: gw.deadlineAt,
        scoringInputVersion: gw.scoringInputVersion,
      })),
    },
    performances: {
      batches,
      fixturesProcessed,
      ...(performanceError ? { error: performanceError } : {}),
    },
    workers,
  };
}

export type ProviderRefresh = {
  verdict: "pass" | "fail" | "missing";
  errorCode?: string;
  fixturesRefreshed: boolean;
  fixtureWindows: number;
};

/**
 * Reads the sanitized evidence written by scripts/backend/current-season-recovery.ts
 * in the preceding workflow step. The recovery canary commits its fixture /
 * result phase before the squad guard that may still fail while the provider
 * lacks the promoted clubs, so "fixtures refreshed" is what matters here.
 */
export function summarizeProviderRefresh(raw: unknown): ProviderRefresh {
  if (!raw || typeof raw !== "object") {
    return { verdict: "missing", fixturesRefreshed: false, fixtureWindows: 0 };
  }
  const evidence = raw as Record<string, unknown>;
  const windows = Array.isArray(evidence.fixtures) ? evidence.fixtures.length : 0;
  const verdict = evidence.verdict === "pass" ? "pass" : "fail";
  const errorCode =
    typeof evidence.errorCode === "string" && /^[a-z][a-z0-9_]{2,100}$/.test(evidence.errorCode)
      ? evidence.errorCode
      : undefined;
  return {
    verdict,
    ...(verdict === "fail" ? { errorCode: errorCode ?? "current_season_recovery_failed" } : {}),
    fixturesRefreshed: windows > 0,
    fixtureWindows: windows,
  };
}

function safeCode(error: unknown, fallback: string) {
  return error instanceof Error && /^[a-z][a-z0-9_]{2,100}$/.test(error.message)
    ? error.message
    : fallback;
}

export function orchestratorEnvironment(env: Record<string, string | undefined>) {
  // A scheduled pass runs only while the repository variable is on; an owner
  // dispatch is authorized by the typed confirmation instead, so one reviewed
  // pass can run before the schedule is enabled.
  if (env.GITHUB_EVENT_NAME === "schedule" && env.FANTASY_AUTOMATION_ENABLED !== "true")
    throw new Error("fantasy_automation_disabled");
  if (
    env.GITHUB_EVENT_NAME === "workflow_dispatch" &&
    (env.GITHUB_ACTOR !== "mrdata007" ||
      env.FANTASY_ORCHESTRATOR_CONFIRMATION !== "RUN_FANTASY_ORCHESTRATOR")
  )
    throw new Error("fantasy_orchestrator_environment_mismatch");
  if (
    env.GITHUB_REPOSITORY !== "mrdata007/botolago-foundation" ||
    env.GITHUB_REF !== "refs/heads/main" ||
    !["schedule", "workflow_dispatch"].includes(env.GITHUB_EVENT_NAME ?? "") ||
    env.GITHUB_RUN_ATTEMPT !== "1" ||
    !/^[0-9a-f]{40}$/.test(env.EXPECTED_COMMIT ?? "") ||
    env.EXPECTED_COMMIT !== env.GITHUB_SHA ||
    env.SUPABASE_PRODUCTION_PROJECT_REF !== "tkewgajrljbwgwedqsxn" ||
    env.SUPABASE_PRODUCTION_PROJECT_NAME !== "BotolaGO Production V2" ||
    env.SUPABASE_PRODUCTION_URL?.replace(/\/$/, "") !== "https://tkewgajrljbwgwedqsxn.supabase.co"
  )
    throw new Error("fantasy_orchestrator_environment_mismatch");
  if (!env.SUPABASE_SECRET_KEY || !env.SPORTSMONKS_API_TOKEN)
    throw new Error("fantasy_orchestrator_credential_missing");
  if (!env.FANTASY_ORCHESTRATOR_EVIDENCE_DIR)
    throw new Error("fantasy_orchestrator_evidence_directory_missing");
  return {
    url: env.SUPABASE_PRODUCTION_URL.replace(/\/$/, ""),
    key: env.SUPABASE_SECRET_KEY,
    token: env.SPORTSMONKS_API_TOKEN,
    evidenceDir: env.FANTASY_ORCHESTRATOR_EVIDENCE_DIR,
    commit: env.EXPECTED_COMMIT!,
  };
}

async function readRecoveryEvidence(directory: string | undefined): Promise<unknown> {
  if (!directory) return null;
  try {
    const text = await readFile(resolve(directory, "current-season-recovery.json"), "utf8");
    return text.length > 2_000_000 ? null : (JSON.parse(text) as unknown);
  } catch {
    return null;
  }
}

if (import.meta.main) {
  let evidenceDir: string | undefined;
  let commit = "";
  try {
    const config = orchestratorEnvironment(process.env);
    evidenceDir = config.evidenceDir;
    commit = config.commit;
    await mkdir(evidenceDir, { recursive: true, mode: 0o700 });
    const api = createClient(config.url, config.key, {
      auth: { persistSession: false, autoRefreshToken: false },
      db: { schema: "api" },
    });
    const rawClient = createClient(config.url, config.key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const gateway: OrchestratorGateway = {
      async rpc(name, args) {
        const { data, error } = await api.rpc(name, args).abortSignal(AbortSignal.timeout(60000));
        if (error)
          throw new Error(safeCode(new Error(error.message), "fantasy_orchestrator_rpc_failed"));
        return data;
      },
      async ingestPerformances(afterFixtureExternalId) {
        const result = await runCurrentPerformanceBatch(
          rawClient,
          config.token,
          afterFixtureExternalId,
        );
        return {
          fixturesProcessed: Number(result.fixturesProcessed ?? 0),
          hasMore: Boolean(result.hasMore),
          nextCursor: typeof result.nextCursor === "string" ? result.nextCursor : null,
        };
      },
    };
    const providerRefresh = summarizeProviderRefresh(
      await readRecoveryEvidence(process.env.CURRENT_SEASON_EVIDENCE_DIR),
    );
    const summary = {
      expectedCommit: commit,
      ...(await orchestrateFantasySeason(gateway, { providerRefresh })),
    };
    const serialized = `${JSON.stringify(summary, null, 2)}\n`;
    if (serialized.includes(config.key) || serialized.includes(config.token))
      throw new Error("credential_in_evidence");
    await writeFile(resolve(evidenceDir, "fantasy-season-orchestrator.json"), serialized, {
      mode: 0o600,
    });
    process.stdout.write(`FANTASY_ORCHESTRATOR_${summary.verdict.toUpperCase()}\n`);
    if (summary.verdict === "failed") process.exitCode = 1;
  } catch (error) {
    const code = safeCode(error, "fantasy_orchestrator_failed");
    if (evidenceDir) {
      await writeFile(
        resolve(evidenceDir, "fantasy-season-orchestrator.json"),
        `${JSON.stringify({ expectedCommit: commit, verdict: "failed", code }, null, 2)}\n`,
        { mode: 0o600 },
      ).catch(() => undefined);
    }
    process.stderr.write(`${JSON.stringify({ verdict: "failed", code })}\n`);
    process.exitCode = 1;
  }
}
