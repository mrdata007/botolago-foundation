import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

import {
  isProviderOutage,
  runCurrentPerformanceBatch,
  type IncompleteFixture,
} from "./current-season-performances";
import { requestSportsMonksJson } from "./sportsmonks-production-probe";
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
 *      as the manual workflow). Each fixture is certified on its own; one the
 *      pass cannot certify is reported with its reason and its age since the
 *      final whistle. Recent ones leave the pass `waiting`; past
 *      `COVERAGE_ESCALATE_HOURS` the pass escalates, because a finished match
 *      without statistics is a missing-points incident, not a wait. Two
 *      failures only wait, with their reason: a provider outage (the listing
 *      does not say which fixtures are already certified, so the fixtures it
 *      kept the pass from reading prove nothing) and a failed read of the
 *      listing itself. The database's own `fantasy_fixture_coverage` check
 *      (migration 20260925180400) reads real coverage and pages when
 *      statistics are really missing.
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
 *   5. a second calendar pass so the summary reflects the progression, then
 *      the points check: a gameweek whose window (`endsAt`, read through
 *      `api.fantasy_gameweeks`) ended more than `COVERAGE_ESCALATE_HOURS` ago
 *      and is still not finalized escalates, whatever the worker said. A
 *      gameweek can wait on `football_not_final` forever with every match
 *      certified; the worker alone would call that `waiting` on every pass.
 *      Windows that cannot be read leave the pass `waiting`; the watchdog's
 *      `fantasy_points` row reads them on its own.
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

/**
 * Hours after the final whistle a finished fixture may go without certified
 * statistics before the pass escalates. On 2026-09-24/25 the season's only
 * finished fixture stayed without them for over ten hours behind green
 * `waiting` runs. The same allowance applies to a gameweek's points, counted
 * from the end of its window (see assessScoring). Override with the
 * repository variable FANTASY_COVERAGE_ESCALATE_HOURS (1-168); any other
 * value is reported and this default is used, as the watchdog does.
 */
export const COVERAGE_ESCALATE_HOURS = 6;
/**
 * 90 minutes, half-time and stoppage: the final whistle estimated from the
 * kickoff, the only time the fixture listing gives.
 */
export const ESTIMATED_MATCH_HOURS = 2;

export type CoverageGap = IncompleteFixture & {
  finalWhistleSource: "kickoff_plus_estimate" | "unknown";
  hoursSinceFinalWhistle: number | null;
  /** Past the threshold, or of unknown age, and not a provider outage: escalates the pass. */
  overdue: boolean;
  /** The provider could not be read for it in this pass (`isProviderOutage`): it only waits. */
  waitingOn?: "provider_outage";
};

/**
 * Ages every fixture a pass could not certify. An age that cannot be computed
 * cannot be shown to be recent, so it counts as overdue rather than waiting.
 *
 * Except after a provider outage. The listing names every finished fixture
 * whose gameweek is not final, certified or not, and says neither which are
 * certified nor when a match ended; no read-only API does per fixture
 * (`api.service_ops_health` counts, and the scoring snapshot RPC writes). So
 * an outage that stopped the pass from reading a fixture says nothing about
 * that fixture, and aging it would page for certified matches. It waits,
 * named by its code. Where migration 20260925180400 is applied,
 * `fantasy_fixture_coverage` in `api.service_ops_health` reads real coverage
 * and warns for a counted match still without certified statistics 6 h after
 * its final whistle, paging at 12 h.
 */
export function assessCoverage(
  incomplete: readonly IncompleteFixture[],
  now: Date,
  escalateHours: number = COVERAGE_ESCALATE_HOURS,
): CoverageGap[] {
  return [...incomplete]
    .sort((a, b) => Number(a.fixtureExternalId) - Number(b.fixtureExternalId))
    .map((fixture) => {
      const whistle = fixture.kickoffAt
        ? Date.parse(fixture.kickoffAt) + ESTIMATED_MATCH_HOURS * 3_600_000
        : Number.NaN;
      const hours = Number.isNaN(whistle)
        ? null
        : Math.round(((now.getTime() - whistle) / 3_600_000) * 10) / 10;
      const outage = fixture.stage === "provider" && isProviderOutage(fixture.code);
      return {
        ...fixture,
        finalWhistleSource: Number.isNaN(whistle) ? "unknown" : "kickoff_plus_estimate",
        hoursSinceFinalWhistle: hours,
        overdue: !outage && (hours === null || hours >= escalateHours),
        ...(outage ? { waitingOn: "provider_outage" as const } : {}),
      };
    });
}

/**
 * `api.fantasy_gameweeks`, the read-only contract the Fantasy pages use.
 * `endsAt` is the gameweek's stored window end (`app.fantasy_gameweeks.ends_at`),
 * used as it is. It is not recomputed here and is not a fixed offset from the
 * last counted kickoff: production's GW1 ends 28 Sep 00:00 UTC, four hours
 * after its last counted kickoff (27 Sep 20:00 UTC).
 */
export const gameweekWindowsSchema = z.object({
  items: z.array(z.object({ id: uuid, sequence: z.number().int(), status, endsAt: z.string() })),
});

/** A gameweek in one of these still owes its points. */
const POINTS_PENDING: readonly string[] = ["open", "locked", "live", "provisional", "finalizing"];

export type ScoringSummary = { escalateHours: number; gameweeks: ScoringGap[] } | { error: string };

export type ScoringGap = {
  gameweekId: string;
  sequence: number;
  status: string;
  windowEndsAt: string;
  hoursSinceWindowEnd: number | null;
  overdue: boolean;
  /** Why the worker waited on it in this pass, when it ran for it. */
  workerCode?: string;
};

/**
 * Gameweeks whose window has ended but whose points are not final. Statistics
 * can be certified for every match and the gameweek still not score: a
 * fixture without `finalized_at` (20260922200000 found 480 of them), an
 * unfrozen assignment or a match moved after the lock all keep it `live` on
 * `football_not_final`, and the worker reports that as `waiting` on every
 * pass. So the age is taken from the gameweek, not from the worker: past
 * `escalateHours` after its window ends, it escalates. `endsAt` does not
 * follow a match moved after the deadline, so such a gameweek escalates
 * early, which is right: a counting match moved after the lock needs a
 * decision. An unreadable end counts as overdue, as for coverage.
 */
export function assessScoring(
  windows: z.infer<typeof gameweekWindowsSchema>,
  workers: readonly WorkerRun[],
  now: Date,
  escalateHours: number = COVERAGE_ESCALATE_HOURS,
): ScoringGap[] {
  return windows.items
    .filter((gw) => POINTS_PENDING.includes(gw.status))
    .map((gw) => {
      const end = Date.parse(gw.endsAt);
      const hours = Number.isNaN(end)
        ? null
        : Math.round(((now.getTime() - end) / 3_600_000) * 10) / 10;
      const workerCode = workers.find((run) => run.gameweekId === gw.id)?.code;
      return {
        gameweekId: gw.id,
        sequence: gw.sequence,
        status: gw.status,
        windowEndsAt: gw.endsAt,
        hoursSinceWindowEnd: hours,
        overdue: hours === null || hours >= escalateHours,
        ...(workerCode ? { workerCode } : {}),
      };
    })
    .filter((gap) => gap.hoursSinceWindowEnd === null || gap.hoursSinceWindowEnd >= 0)
    .sort((a, b) => a.sequence - b.sequence);
}

export interface OrchestratorGateway extends FantasyWorkerGateway {
  /**
   * One bounded finished-fixture performance batch; `null` cursor starts from
   * the beginning. `providerOutage` is an outage an earlier page of this pass
   * met: the page is then listed and reported without asking the provider.
   */
  ingestPerformances(
    afterFixtureExternalId: string | null,
    options?: { providerOutage?: string | null },
  ): Promise<{
    fixturesProcessed: number;
    hasMore: boolean;
    nextCursor: string | null;
    /** Finished fixtures of this page left without certified statistics. */
    incomplete?: IncompleteFixture[];
    /** The provider outage this page met or was handed, if any. */
    providerOutage?: string | null;
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
  /** Coverage age after which a finished fixture escalates; see COVERAGE_ESCALATE_HOURS. */
  coverage?: { escalateHours?: number };
  /**
   * Repository variables set to a value the pass could not use; it ran on
   * their defaults instead. Reported, and the verdict is at least `waiting`.
   */
  invalidSettings?: readonly string[];
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
  const coverageEscalateHours = options.coverage?.escalateHours ?? COVERAGE_ESCALATE_HOURS;
  const invalidSettings = [...(options.invalidSettings ?? [])];
  const workers: WorkerRun[] = [];
  // A setting the pass could not use is a typo to fix, not an incident: the
  // pass ran on the default and says so.
  let verdict: Verdict = invalidSettings.length > 0 ? "waiting" : "ok";

  const before = calendarSyncSchema.parse(
    await gateway.rpc("service_sync_fantasy_calendar", { p_fantasy_season_id: null }),
  );

  let cursor: string | null = null;
  let batches = 0;
  let fixturesProcessed = 0;
  let performanceError: string | undefined;
  let truncated = false;
  const incomplete: IncompleteFixture[] = [];
  let performanceDiagnostic: Record<string, unknown> | undefined;
  // Once one page meets a provider outage, the later pages are listed (so
  // their fixtures are still reported) but the provider is not asked again:
  // ten pages of three retries with up to 30 s of Retry-After each would
  // outlast the job.
  let providerOutage: string | null = null;
  try {
    do {
      const batch = await gateway.ingestPerformances(cursor, { providerOutage });
      batches += 1;
      fixturesProcessed += batch.fixturesProcessed;
      incomplete.push(...(batch.incomplete ?? []));
      providerOutage = batch.providerOutage ?? providerOutage;
      if (!batch.hasMore) break;
      if (!batch.nextCursor || batch.nextCursor === cursor)
        throw new Error("performance_cursor_invalid");
      cursor = batch.nextCursor;
      truncated = batches >= maxPerformanceBatches;
    } while (!truncated);
  } catch (error) {
    // Per-fixture problems come back in `incomplete`; what reaches here is the
    // fixture listing itself (a database read, its contract, the cursor), with
    // nothing to age.
    performanceError = safeCode(error, "performance_ingestion_failed");
    performanceDiagnostic = safeDiagnostic(error);
  }
  const coverage = assessCoverage(incomplete, now, coverageEscalateHours);

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
  // A pass that could not list the finished fixtures knows nothing about their
  // statistics, and one failed read is not an incident: it waits, named by
  // `performances.error`. Until 2026-09-25 one bad payload failed the whole
  // listing, and the pass waited, green, while a finished match went without
  // statistics for about ten hours; payloads now fail alone, in `incomplete`,
  // and age. If the listing keeps failing, the database's
  // `fantasy_fixture_coverage` (where 20260925180400 is applied) and the
  // watchdog's `fantasy_points` page once statistics or points go missing.
  if (performanceError) verdict = mergeVerdict(verdict, "waiting");
  // Fixtures past the last page are never reached while the cursor restarts
  // at null each pass, so a truncated listing cannot wait for itself.
  if (truncated) verdict = mergeVerdict(verdict, "escalate");
  if (coverage.some((gap) => gap.overdue)) verdict = mergeVerdict(verdict, "escalate");
  else if (coverage.length > 0) verdict = mergeVerdict(verdict, "waiting");

  // Points, aged the same way. Only read when a gameweek could have ended
  // unscored: an open gameweek before its deadline cannot have.
  let scoring: { gameweeks: ScoringGap[] } | { error: string } = { gameweeks: [] };
  if (
    after.gameweeks.some(
      (gw) =>
        POINTS_PENDING.includes(gw.status) &&
        (gw.status !== "open" || Date.parse(gw.deadlineAt) <= now.getTime()),
    )
  ) {
    try {
      const windows = gameweekWindowsSchema.parse(
        await gateway.rpc("fantasy_gameweeks", {
          p_season_id: after.seasonId,
          p_before_sequence: null,
          p_limit: 100,
        }),
      );
      scoring = { gameweeks: assessScoring(windows, workers, now, coverageEscalateHours) };
    } catch (error) {
      // Without the windows this pass cannot show a gameweek on time, nor
      // late: it waits, named by `scoring.error`. The watchdog's
      // `fantasy_points` row reads the same windows on its own schedule.
      scoring = { error: safeCode(error, "fantasy_gameweek_windows_unreadable") };
    }
  }
  if ("error" in scoring) verdict = mergeVerdict(verdict, "waiting");
  else if (scoring.gameweeks.some((gap) => gap.overdue))
    verdict = mergeVerdict(verdict, "escalate");
  else if (scoring.gameweeks.length > 0) verdict = mergeVerdict(verdict, "waiting");
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
    ...(invalidSettings.length > 0 ? { invalidSettings } : {}),
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
      ...(performanceDiagnostic ? { diagnostic: performanceDiagnostic } : {}),
      ...(truncated ? { truncated: true } : {}),
      ...(providerOutage ? { providerOutage } : {}),
      ...(coverage.length > 0 ? { coverageEscalateHours, incomplete: coverage } : {}),
    },
    // Absent (and so left out of the evidence) while no gameweek has ended unscored.
    scoring: ("error" in scoring
      ? scoring
      : scoring.gameweeks.length > 0
        ? { escalateHours: coverageEscalateHours, gameweeks: scoring.gameweeks }
        : undefined) as ScoringSummary | undefined,
    workers,
    skipped,
    prizes,
    deadlineWatch,
  };
}

type OrchestratorSummary = Awaited<ReturnType<typeof orchestrateFantasySeason>>;

/**
 * Where a gap stopped, in a few words: the field, the database's own code or
 * the unnamed starters.
 */
function gapReason(gap: CoverageGap): string {
  const diagnostic = gap.diagnostic ?? {};
  if (typeof diagnostic.field === "string")
    return ` at ${diagnostic.field}${typeof diagnostic.valueType === "string" ? ` (${diagnostic.valueType})` : ""}`;
  if (typeof diagnostic.reason === "string") return ` ${diagnostic.reason}`;
  if (typeof diagnostic.unidentifiedStarters === "number")
    return ` (${diagnostic.unidentifiedStarters} unnamed starters)`;
  return "";
}

function renderScoring(scoring: OrchestratorSummary["scoring"]): string {
  if (!scoring) return "none";
  if ("error" in scoring) return `windows unreadable: \`${scoring.error}\` (waiting)`;
  const overdue = scoring.gameweeks.filter((gap) => gap.overdue).length;
  const listed = scoring.gameweeks.map(
    (gap) =>
      `GW${gap.sequence} ${gap.status}${gap.workerCode ? ` \`${gap.workerCode}\`` : ""}, ${
        gap.hoursSinceWindowEnd === null
          ? "window end unreadable"
          : `window ended ${gap.hoursSinceWindowEnd} h ago`
      }`,
  );
  return `${scoring.gameweeks.length} gameweek(s), ${overdue} past ${scoring.escalateHours} h: ${listed.join("; ")}`;
}

function renderCoverage(performances: OrchestratorSummary["performances"]): string {
  const all = performances.incomplete ?? [];
  // Not read because of a provider outage: possibly certified, so not listed
  // as missing statistics.
  const unread = all.filter((gap) => gap.waitingOn === "provider_outage");
  const gaps = all.filter((gap) => gap.waitingOn !== "provider_outage");
  const parts: string[] = [];
  if (gaps.length > 0) {
    const overdue = gaps.filter((gap) => gap.overdue).length;
    const listed = gaps
      .slice(0, 5)
      .map(
        (gap) =>
          `${gap.fixtureExternalId} \`${gap.code}\`${gapReason(gap)}, ${
            gap.hoursSinceFinalWhistle === null
              ? "age unknown"
              : `${gap.hoursSinceFinalWhistle} h after the final whistle`
          }`,
      );
    parts.push(
      `${gaps.length} fixture(s), ${overdue} past ${performances.coverageEscalateHours} h: ${listed.join("; ")}${gaps.length > 5 ? "; …" : ""}`,
    );
  }
  if (unread.length > 0)
    parts.push(
      `provider outage \`${performances.providerOutage ?? unread[0]!.code}\`: ${unread.length} listed fixture(s) not read, certified or not (waiting)`,
    );
  return parts.length > 0 ? parts.join("; ") : "none";
}

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
      `${summary.performances.fixturesProcessed} fixtures in ${summary.performances.batches} batch(es)${summary.performances.error ? `, error \`${summary.performances.error}\`` : ""}${summary.performances.diagnostic ? ` \`${JSON.stringify(summary.performances.diagnostic)}\`` : ""}${summary.performances.truncated ? ", listing truncated" : ""}`,
    ],
    ["Finished without statistics", renderCoverage(summary.performances)],
    ["Ended without final points", renderScoring(summary.scoring)],
    [
      "Deadline watch",
      watch.error ? `error \`${watch.error}\`` : `${watch.escalations?.length ?? 0} escalation(s)`,
    ],
    ...(summary.invalidSettings
      ? ([
          [
            "Settings",
            `${summary.invalidSettings.map((name) => `\`${name}\``).join(", ")} not usable; the default was used (waiting)`,
          ],
        ] as Array<[string, string]>)
      : []),
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
  // The workflow runs the refresh with `continue-on-error`, which lists the
  // step as a success in the run's job summary whatever happened; its real
  // outcome only arrives here. A step that failed after writing `pass` did not
  // finish what that evidence claims, so it is never counted as a refresh.
  if (stepOutcome === "failure" && evidence.verdict === "pass") {
    return {
      verdict: "fail",
      errorCode: "current_season_recovery_step_failed",
      fixturesRefreshed: false,
      fixtureWindows: windows,
      failed: true,
    };
  }
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

/**
 * What the statistics import says about its failure, when it says something
 * (`CurrentPerformanceError.diagnostic`): which provider field, which fixture,
 * how many rows, which database code. Only flat strings, numbers and booleans
 * are kept, alone or in short lists of flat records, so nothing from a payload
 * can reach the evidence. A string may be a field path (`batch.items[2]`) or
 * a database code (`CURRENT_SEASON_REQUIRED`), never free text.
 */
export function safeDiagnostic(error: unknown): Record<string, unknown> | undefined {
  const diagnostic =
    error instanceof Error && "diagnostic" in error
      ? (error as { diagnostic?: unknown }).diagnostic
      : undefined;
  if (!diagnostic || typeof diagnostic !== "object" || Array.isArray(diagnostic)) return undefined;
  const safeKey = (key: string) => /^[a-zA-Z]{1,40}$/.test(key);
  const flat = (value: unknown) =>
    typeof value === "number" ||
    typeof value === "boolean" ||
    (typeof value === "string" && /^[a-zA-Z0-9_.[\]]{1,80}$/.test(value));
  const flatRecord = (value: unknown) =>
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.entries(value).every(([key, item]) => safeKey(key) && flat(item));
  const kept = Object.entries(diagnostic).filter(
    ([key, value]) =>
      safeKey(key) &&
      (flat(value) || (Array.isArray(value) && value.length <= 20 && value.every(flatRecord))),
  );
  return kept.length ? Object.fromEntries(kept) : undefined;
}

/**
 * The repository variable FANTASY_COVERAGE_ESCALATE_HOURS (1-168); `null` when
 * it is set to anything else. The watchdog reads it the same way
 * (`pointsEscalateHours`).
 */
function coverageEscalateHours(raw: string | undefined): number | null {
  if (raw === undefined || raw === "") return COVERAGE_ESCALATE_HOURS;
  if (!/^\d{1,3}$/.test(raw) || Number(raw) < 1 || Number(raw) > 168) return null;
  return Number(raw);
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
  // A typo in this threshold used to stop the whole pass, the season with it.
  // Like the watchdog, the pass now runs on the default and names the variable.
  const coverageHours = coverageEscalateHours(env.FANTASY_COVERAGE_ESCALATE_HOURS);
  return {
    deadlineWatch: { warnHours, escalateHours },
    coverage: { escalateHours: coverageHours ?? COVERAGE_ESCALATE_HOURS },
    invalidSettings: coverageHours === null ? ["FANTASY_COVERAGE_ESCALATE_HOURS"] : [],
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
      async ingestPerformances(afterFixtureExternalId, options) {
        const result = await runCurrentPerformanceBatch(
          rawClient,
          config.token,
          afterFixtureExternalId,
          requestSportsMonksJson,
          { providerOutage: options?.providerOutage ?? null },
        );
        return {
          fixturesProcessed: Number(result.fixturesProcessed ?? 0),
          hasMore: Boolean(result.hasMore),
          nextCursor: typeof result.nextCursor === "string" ? result.nextCursor : null,
          incomplete: result.incomplete,
          providerOutage: result.providerOutage,
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
        coverage: config.coverage,
        invalidSettings: config.invalidSettings,
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
