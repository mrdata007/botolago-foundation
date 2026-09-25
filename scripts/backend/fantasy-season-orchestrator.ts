import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

import { runCurrentPerformanceBatch } from "./current-season-performances";
import {
  evaluateFantasyPrizes,
  rpcFailure,
  runFantasyLifecycle,
  type FantasyWorkerGateway,
} from "./fantasy-lifecycle-runner";

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
 *   4. `api.service_evaluate_fantasy_prizes` — a catch-up for prize winners.
 *      The worker already evaluates what it has just finalized; this pass picks
 *      up whatever an interrupted run left behind, including a season's last
 *      gameweek, which has no successor to bring the worker back. A failure or
 *      a blocked season degrades the verdict to `waiting`, never `failed`: a
 *      prize is never a reason to stop the game. Until the prize migration is
 *      promoted the function does not exist; that is reported as `skipped`
 *      and leaves the verdict alone.
 *   5. a second calendar pass so the summary reflects the progression.
 *   6. `api.service_fantasy_deadline_watch` — a read-only guard that reports
 *      scheduled/open gameweeks whose deadline is approaching while a counting
 *      fixture still carries an unconfirmed placeholder kickoff. Inside the
 *      escalation window the verdict becomes `escalate` and the run exits 1,
 *      which is the only escalation channel this workflow has.
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

/**
 * Read-only deadline watch (`api.service_fantasy_deadline_watch`): scheduled /
 * open gameweeks whose deadline is inside the warning window while an active
 * counting fixture still carries an unconfirmed (00:00 UTC placeholder)
 * kickoff. The guard never invents a kickoff and never moves a deadline; the
 * severity is decided by the database clock, not here.
 */
export const deadlineWatchSchema = z.object({
  schemaVersion: z.literal(1),
  seasonId: uuid,
  seasonStatus: z.string(),
  warnHours: z.number().int(),
  escalateHours: z.number().int(),
  serverTime: z.string(),
  remediation: z.string(),
  gameweeks: z.array(
    z.object({
      gameweekId: uuid,
      sequence: z.number().int(),
      status,
      deadlineAt: z.string(),
      startsAt: z.string().nullable(),
      hoursToDeadline: z.number(),
      deadlinePassed: z.boolean(),
      unconfirmedFixtures: z.number().int().min(0),
      totalCountingFixtures: z.number().int().min(0),
      deadlineDerivedFromPlaceholder: z.boolean(),
      severity: z.enum(["info", "escalate"]),
      fixtures: z.array(
        z.object({
          fixtureId: uuid,
          homeTeam: z.string().nullable(),
          awayTeam: z.string().nullable(),
          providerKickoffAt: z.string(),
          assignedKickoffAt: z.string().nullable(),
          originalKickoffAt: z.string().nullable(),
          fixtureStatus: z.string(),
          assignmentStatus: z.string(),
          frozen: z.boolean(),
          providerUpdatedAt: z.string().nullable(),
          sourceSequence: z.number().int().nullable(),
        }),
      ),
    }),
  ),
});
export type DeadlineWatch = z.infer<typeof deadlineWatchSchema>;

/** Informational from here; red inside the escalation window. One definition, mirrored by the RPC defaults. */
export const DEADLINE_WATCH_WARN_HOURS = 72;
export const DEADLINE_WATCH_ESCALATE_HOURS = 24;

export type Verdict = "ok" | "waiting" | "escalate" | "failed";
const VERDICT_RANK: Record<Verdict, number> = { ok: 0, waiting: 1, escalate: 2, failed: 3 };

/** The worst of two verdicts; `failed` always wins. */
export function mergeVerdict(current: Verdict, next: Verdict): Verdict {
  return VERDICT_RANK[next] > VERDICT_RANK[current] ? next : current;
}

/** Only a red run reaches an operator: the workflow step has no other channel. */
export function shouldFailRun(verdict: Verdict) {
  return verdict === "failed" || verdict === "escalate";
}

/** Clock-free partition of the watch payload; ordering is explicit so reruns serialise identically. */
export function summarizeDeadlineWatch(watch: DeadlineWatch) {
  const gameweeks = [...watch.gameweeks].sort((a, b) => a.sequence - b.sequence);
  return {
    affected: gameweeks.length,
    escalations: gameweeks.filter((gw) => gw.severity === "escalate"),
    informational: gameweeks.filter((gw) => gw.severity === "info"),
    remediation: watch.remediation,
  };
}

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
  /** Deadline watch window; defaults mirror the RPC defaults. */
  deadlineWatch?: { warnHours?: number; escalateHours?: number };
}

export type WorkerRun = {
  gameweekId: string;
  sequence: number;
  reason: "deadline_passed" | "in_progress" | "progression_pending";
  calculationVersion: number;
  outcome: string;
  code?: string;
};

export type SkippedTarget = {
  gameweekId: string;
  sequence: number;
  reason: "deadline_unconfirmed";
};

/**
 * Gameweek ids whose round note reports an unconfirmed deadline: at least one
 * active, counting fixture of that round still carries a placeholder kickoff,
 * so the stored deadline is not authoritative. The calendar sync is the single
 * source of that predicate; nothing is recomputed here.
 */
function gameweeksWithUnconfirmedDeadline(calendar: CalendarSync) {
  const ids = new Set<string>();
  for (const round of calendar.rounds) {
    if (!round.gameweekId) continue;
    const unconfirmed = round.notes.some(
      (note) =>
        note === "deadline_unconfirmed" ||
        (typeof note === "object" &&
          note !== null &&
          (note as Record<string, unknown>).deadlineUnconfirmed === true),
    );
    if (unconfirmed) ids.add(round.gameweekId);
  }
  return ids;
}

/**
 * Gameweeks that need the worker, in sequence order, plus the gameweeks that
 * were deliberately left alone. An `open` gameweek whose deadline is derived
 * from a placeholder kickoff is never locked by this pass: locking it would
 * freeze lineups on a deadline the provider never published, and no path can
 * undo that afterwards.
 */
export function selectWorkerTargets(calendar: CalendarSync, now: Date) {
  const targets: Array<{
    gameweekId: string;
    sequence: number;
    reason: WorkerRun["reason"];
    calculationVersion: number;
  }> = [];
  const skipped: SkippedTarget[] = [];
  const unconfirmed = gameweeksWithUnconfirmedDeadline(calendar);
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
      if (unconfirmed.has(gw.id)) {
        skipped.push({
          gameweekId: gw.id,
          sequence: gw.sequence,
          reason: "deadline_unconfirmed",
        });
        continue;
      }
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
  return { targets, skipped };
}

export async function orchestrateFantasySeason(
  gateway: OrchestratorGateway,
  options: OrchestratorOptions = {},
) {
  const now = options.now ?? new Date();
  const maxWorkerRuns = options.maxWorkerRuns ?? 2;
  const maxPerformanceBatches = options.maxPerformanceBatches ?? 10;
  const warnHours = options.deadlineWatch?.warnHours ?? DEADLINE_WATCH_WARN_HOURS;
  const escalateHours = options.deadlineWatch?.escalateHours ?? DEADLINE_WATCH_ESCALATE_HOURS;
  const workers: WorkerRun[] = [];
  let verdict: Verdict = "ok";

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

  const selection = selectWorkerTargets(before, now);
  const skipped = selection.skipped;
  // A refusal is not a success: the round is waiting for a real kickoff.
  if (skipped.length > 0) verdict = mergeVerdict(verdict, "waiting");
  const targets = selection.targets.slice(0, maxWorkerRuns);
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
      if (result.outcome === "waiting") verdict = mergeVerdict(verdict, "waiting");
    } catch (error) {
      workers.push({
        ...target,
        outcome: "failed",
        code: safeCode(error, "fantasy_worker_failed"),
      });
      verdict = mergeVerdict(verdict, "failed");
      break;
    }
  }

  const prizes = await evaluateFantasyPrizes((name, args) => gateway.rpc(name, args));
  if ("error" in prizes || ("blocked" in prizes && prizes.blocked.length > 0))
    verdict = mergeVerdict(verdict, "waiting");

  const after = calendarSyncSchema.parse(
    await gateway.rpc("service_sync_fantasy_calendar", { p_fantasy_season_id: null }),
  );
  if (performanceError) verdict = mergeVerdict(verdict, "waiting");
  const providerRefresh = options.providerRefresh;
  // Without a fixture refresh the pass can only work from data already in the
  // database; it is still safe, but never "ok" until the provider is read again.
  // A refresh that was expected to pass and did not (fixtures-only scope, or a
  // failed step with no evidence) fails the run: green would close its alert
  // while later fixtures and results stay stale.
  if (providerRefresh?.failed) verdict = mergeVerdict(verdict, "failed");
  else if (providerRefresh && !providerRefresh.fixturesRefreshed)
    verdict = mergeVerdict(verdict, "waiting");

  // The guard runs last and never short-circuits the pass.
  let deadlineWatch: Record<string, unknown>;
  try {
    const watch = deadlineWatchSchema.parse(
      await gateway.rpc("service_fantasy_deadline_watch", {
        p_fantasy_season_id: null,
        p_warn_hours: warnHours,
        p_escalate_hours: escalateHours,
      }),
    );
    const summary = summarizeDeadlineWatch(watch);
    deadlineWatch = { warnHours: watch.warnHours, escalateHours: watch.escalateHours, ...summary };
    if (summary.escalations.length > 0) verdict = mergeVerdict(verdict, "escalate");
  } catch (error) {
    deadlineWatch = { error: safeCode(error, "fantasy_deadline_watch_failed") };
    verdict = mergeVerdict(verdict, "waiting");
  }

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
    skipped,
    prizes,
    deadlineWatch,
  };
}

type OrchestratorSummary = Awaited<ReturnType<typeof orchestrateFantasySeason>>;

/**
 * The run's health in a few table rows, for the GitHub run page
 * ($GITHUB_STEP_SUMMARY). Built only from the sanitised summary: codes,
 * counts, statuses and deadlines -- never a credential or a user.
 */
export function renderHealthSummary(summary: OrchestratorSummary): string {
  const refresh = summary.providerRefresh;
  const watch = summary.deadlineWatch as { escalations?: unknown[]; error?: string };
  const rows: Array<[string, string]> = [
    [
      "Provider refresh",
      !refresh
        ? "not run"
        : refresh.verdict === "pass"
          ? `pass (${refresh.fixtureWindows} fixture window${refresh.fixtureWindows === 1 ? "" : "s"})`
          : `${refresh.verdict}${refresh.errorCode ? `: \`${refresh.errorCode}\`` : ""}${
              refresh.fixturesRefreshed
                ? " (fixtures refreshed)"
                : refresh.failed && refresh.fixtureWindows > 0
                  ? ` (partial: ${refresh.fixtureWindows} fixture window${refresh.fixtureWindows === 1 ? "" : "s"} before the failure)`
                  : ""
            }`,
    ],
    [
      "Calendar",
      `created ${summary.calendar.gameweeksCreated}, deadline changes ${summary.calendar.deadlineChanges}, blocked rounds ${summary.calendar.blockedRounds}`,
    ],
    [
      "Gameweeks",
      summary.calendar.gameweeks
        .map((gw) => `GW${gw.sequence} ${gw.status} (deadline ${gw.deadlineAt.slice(0, 16)}Z)`)
        .join("; ") || "none",
    ],
    [
      "Lifecycle",
      summary.workers
        .map((w) => `GW${w.sequence} ${w.reason} → ${w.outcome}${w.code ? ` \`${w.code}\`` : ""}`)
        .join("; ") || "nothing due",
    ],
    [
      "Performances",
      `${summary.performances.fixturesProcessed} fixtures in ${summary.performances.batches} batch(es)${summary.performances.error ? `, error \`${summary.performances.error}\`` : ""}`,
    ],
    [
      "Deadline watch",
      watch.error ? `error \`${watch.error}\`` : `${watch.escalations?.length ?? 0} escalation(s)`,
    ],
  ];
  return [
    `## Fantasy season orchestrator: ${summary.verdict.toUpperCase()}`,
    "",
    "| Check | State |",
    "| --- | --- |",
    ...rows.map(([check, state]) => `| ${check} | ${state.replace(/\|/g, "\\|")} |`),
    "",
  ].join("\n");
}

export type ProviderRefresh = {
  verdict: "pass" | "fail" | "missing";
  errorCode?: string;
  /** Every fixture window the refresh set out to read was committed. */
  fixturesRefreshed: boolean;
  fixtureWindows: number;
  /**
   * The refresh was expected to pass and did not: a fixtures-only run
   * (nothing in it is allowed to fail) that failed or refreshed only part of
   * the season, or a refresh step that failed without leaving evidence. The
   * orchestrator then fails the run, so it stays red and its alert open.
   */
  failed: boolean;
};

/**
 * Reads the sanitized evidence written by scripts/backend/current-season-recovery.ts
 * in the preceding workflow step.
 *
 * A full-scope recovery (`recoveryScope: "all"`) commits its fixture/result
 * phase before the squad guard, which may still fail while the provider lacks
 * the promoted clubs: there, any committed window means the fixtures were
 * refreshed. A fixtures-only run (`recoveryScope: "fixtures"`, what the
 * orchestrator workflow runs) has nothing after its fixture loop, so a failed
 * verdict means a later window failed and the season was only partly
 * refreshed: only a pass counts, and anything else fails the run.
 * `stepOutcome` is the refresh step's GitHub outcome; a step that failed
 * without leaving evidence fails the run too.
 */
export function summarizeProviderRefresh(
  raw: unknown,
  { stepOutcome }: { stepOutcome?: string } = {},
): ProviderRefresh {
  if (!raw || typeof raw !== "object") {
    const failed = stepOutcome === "failure";
    return {
      verdict: failed ? "fail" : "missing",
      ...(failed ? { errorCode: "current_season_recovery_step_failed" } : {}),
      fixturesRefreshed: false,
      fixtureWindows: 0,
      failed,
    };
  }
  const evidence = raw as Record<string, unknown>;
  const windows = Array.isArray(evidence.fixtures) ? evidence.fixtures.length : 0;
  const verdict = evidence.verdict === "pass" ? "pass" : "fail";
  const errorCode =
    typeof evidence.errorCode === "string" && /^[a-z][a-z0-9_]{2,100}$/.test(evidence.errorCode)
      ? evidence.errorCode
      : undefined;
  const fixturesOnly = evidence.recoveryScope === "fixtures";
  const fixturesRefreshed = fixturesOnly ? verdict === "pass" && windows > 0 : windows > 0;
  return {
    verdict,
    ...(verdict === "fail" ? { errorCode: errorCode ?? "current_season_recovery_failed" } : {}),
    fixturesRefreshed,
    fixtureWindows: windows,
    failed: fixturesOnly && !fixturesRefreshed,
  };
}

function safeCode(error: unknown, fallback: string) {
  return error instanceof Error && /^[a-z][a-z0-9_]{2,100}$/.test(error.message)
    ? error.message
    : fallback;
}

function deadlineWatchHours(raw: string | undefined, fallback: number) {
  if (raw === undefined || raw === "") return fallback;
  if (!/^\d{1,3}$/.test(raw)) throw new Error("fantasy_deadline_watch_window_invalid");
  const value = Number(raw);
  if (value > 720) throw new Error("fantasy_deadline_watch_window_invalid");
  return value;
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
  const warnHours = deadlineWatchHours(
    env.FANTASY_DEADLINE_WATCH_WARN_HOURS,
    DEADLINE_WATCH_WARN_HOURS,
  );
  const escalateHours = deadlineWatchHours(
    env.FANTASY_DEADLINE_WATCH_ESCALATE_HOURS,
    DEADLINE_WATCH_ESCALATE_HOURS,
  );
  if (warnHours < escalateHours) throw new Error("fantasy_deadline_watch_window_invalid");
  return {
    deadlineWatch: { warnHours, escalateHours },
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
          throw rpcFailure(
            safeCode(new Error(error.message), "fantasy_orchestrator_rpc_failed"),
            error.code,
          );
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
      { stepOutcome: process.env.RECOVERY_STEP_OUTCOME },
    );
    const summary = {
      expectedCommit: commit,
      ...(await orchestrateFantasySeason(gateway, {
        providerRefresh,
        deadlineWatch: config.deadlineWatch,
      })),
    };
    const serialized = `${JSON.stringify(summary, null, 2)}\n`;
    if (serialized.includes(config.key) || serialized.includes(config.token))
      throw new Error("credential_in_evidence");
    await writeFile(resolve(evidenceDir, "fantasy-season-orchestrator.json"), serialized, {
      mode: 0o600,
    });
    if (process.env.GITHUB_STEP_SUMMARY) {
      await appendFile(process.env.GITHUB_STEP_SUMMARY, renderHealthSummary(summary)).catch(
        () => undefined,
      );
    }
    process.stdout.write(`FANTASY_ORCHESTRATOR_${summary.verdict.toUpperCase()}\n`);
    if (shouldFailRun(summary.verdict)) process.exitCode = 1;
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
