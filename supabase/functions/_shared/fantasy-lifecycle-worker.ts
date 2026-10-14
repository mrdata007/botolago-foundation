// The Fantasy lifecycle worker: scoring, mode selection, finalization,
// close/lock and opening the next gameweek's postwork, every durable step a
// guarded service-role RPC (docs/backend/FANTASY_WORKER_SCHEDULE.md).
//
// Moved here from scripts/backend/fantasy-lifecycle-runner.ts (which re-exports
// it and keeps the manual command line) so the Edge Function
// `fantasy-lifecycle-worker` runs the very same code as the GitHub scripts:
// supabase/functions/ is what an Edge deploy bundles, scripts/ is not.
//
// Under Bun (tests, scripts) `zod` resolves from node_modules. Under Deno the
// function's own deno.json maps it to the same version (npm:zod@4.4.3).

import { z } from "zod";
import { scoreCertifiedPlayerFixture } from "./fantasy-adaptive-scoring.ts";
import { certified, type FieldEvidence } from "./fantasy-adaptive-core.ts";
import {
  RATING_RULESET_VERSION,
  RATING_SCORING_VERSION,
  scoreRatingPlayerFixture,
} from "./fantasy-rating-scoring.ts";
import { scorePlayerFixture, type ScoringRules } from "./fantasy-scoring-core.ts";
import { calculateAutomaticSubstitutions } from "./fantasy-substitutions-core.ts";

const uuid = z.string().uuid();
const integer = z.coerce.number().int();
const positive = integer.positive();
const position = z.enum(["GK", "DEF", "MID", "FWD"]);
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
const lifecycleSchema = z.object({
  gameweekId: uuid,
  adaptiveScoringEnabled: z.boolean().optional(),
  incrementalScoringEnabled: z.boolean().optional(),
  seasonId: uuid,
  status,
  lockVersion: positive,
  sequenceNumber: positive,
  scoringInputVersion: integer.min(0),
  nextGameweekId: uuid.nullable().optional(),
  advancedToGameweekId: uuid.nullable().optional(),
  // Staged SofaScore statistics (migration 20261013160200). Absent on an older database.
  stagedStatsEnabled: z.boolean().optional(),
  closedAt: z.string().nullable().optional(),
  closedCalculationVersion: integer.nullable().optional(),
  closeCompleted: z.boolean().optional(),
  stagedLockBlocker: z.string().nullable().optional(),
  stagedRescoreNeeded: z.boolean().optional(),
  postworkCompleted: z.boolean().optional(),
  hasMore: z.boolean().optional(),
  changed: z.boolean().optional(),
  waitingReason: z.string().nullable().optional(),
});
const statsSchema = z.object({
  minutes: integer.min(0).max(120),
  goals: integer.min(0),
  assists: integer.min(0),
  cleanSheet: z.boolean(),
  goalsConceded: integer.min(0),
  saves: integer.min(0),
  penaltiesSaved: integer.min(0),
  penaltiesMissed: integer.min(0),
  yellowCards: integer.min(0),
  redCards: integer.min(0),
  secondYellowDismissals: integer.min(0),
  ownGoals: integer.min(0),
  bonus: integer,
  playerOfMatchPoints: integer,
});
export const scoringSnapshotSchema = z.object({
  gameweekId: uuid,
  calculationVersion: positive,
  inputDigest: z.string().regex(/^[0-9a-f]{64}$/),
  scoringVersion: positive,
  adaptive: z.boolean().optional(),
  incremental: z.boolean().optional(),
  pendingPlayerIds: z.array(uuid).optional(),
  pendingFixtures: z.array(z.unknown()).optional(),
  fixtures: z.array(z.object({ adaptiveReady: z.boolean().optional() })).optional(),
  sealed: z.boolean(),
  ruleset: z.object({
    id: uuid,
    version: positive,
    minor_version: integer.min(0),
    captain_multiplier: z.coerce.number().min(1).max(5),
    triple_captain_multiplier: z.coerce.number().min(1).max(5),
    full_appearance_minutes: positive,
  }),
  positionRules: z
    .array(
      z.object({
        code: position,
        squad_quota: positive,
        starting_minimum: integer.min(0),
        starting_maximum: positive,
        goal_points: integer,
        clean_sheet_points: integer,
      }),
    )
    .length(4),
  scoringRules: z.array(
    z.object({
      category: z.string(),
      points: integer,
      threshold: z.coerce.number().nullable(),
      positionCode: position.nullable(),
    }),
  ),
  features: z.object({
    bonus_points_enabled: z.boolean(),
    player_of_match_enabled: z.boolean(),
    official_assists_only: z.boolean(),
    inferred_assists_enabled: z.boolean(),
  }),
  players: z
    .array(z.object({ fantasyPlayerId: uuid, playerId: uuid, teamId: uuid, position }))
    .min(1)
    .max(2000),
  playerFixtures: z
    .array(
      z.object({
        fantasyPlayerId: uuid,
        playerId: uuid,
        fixtureId: uuid,
        position,
        sourceSequence: integer.min(0),
        stats: z.preprocess(
          (value) =>
            value && typeof value === "object"
              ? Object.fromEntries(Object.entries(value).filter(([, item]) => item !== null))
              : value,
          statsSchema.partial(),
        ),
        evidence: z.record(z.string(), z.unknown()).optional(),
        scoringMode: z.enum(["full", "simple"]).nullable().optional(),
        participationKnown: z.boolean().optional(),
        // The SofaScore match rating, carried only in a rating gameweek
        // (migration 20261014090000): two decimals at most, null without one.
        rating: z.number().min(0).max(10).nullable().optional(),
      }),
    )
    .max(128000),
  teams: z
    .array(
      z.object({
        teamId: uuid,
        lineupId: uuid,
        chipType: z.enum(["wildcard", "free_hit", "bench_boost", "triple_captain"]).nullable(),
        transferHit: integer.min(0),
        players: z
          .array(
            z.object({
              id: uuid,
              position,
              starter: z.boolean(),
              benchOrder: integer.nullable(),
              captain: z.boolean(),
              viceCaptain: z.boolean(),
            }),
          )
          .length(15),
      }),
    )
    .max(100),
  afterTeamId: uuid.nullable(),
  hasMore: z.boolean(),
});
export type ScoringSnapshot = z.infer<typeof scoringSnapshotSchema>;

function scoringRules(snapshot: ScoringSnapshot): ScoringRules {
  // These are the exact published v1 scoring semantics implemented by the
  // domain scorer. A new ruleset must be reviewed instead of being ignored.
  if (
    ![1, 2].includes(snapshot.ruleset.version) ||
    snapshot.ruleset.minor_version > 1 ||
    snapshot.features.bonus_points_enabled ||
    snapshot.features.player_of_match_enabled ||
    !snapshot.features.official_assists_only ||
    snapshot.features.inferred_assists_enabled
  )
    throw new Error("fantasy_scoring_rules_unsupported");
  const get = (category: string, code: "GK" | "DEF" | "MID" | "FWD" | null = null) => {
    const matches = snapshot.scoringRules.filter(
      (rule) => rule.category === category && rule.positionCode === code,
    );
    if (matches.length !== 1) throw new Error("fantasy_scoring_rules_incomplete");
    return matches[0]!;
  };
  const goal = {} as ScoringRules["goal"];
  const cleanSheet = {} as ScoringRules["cleanSheet"];
  if (new Set(snapshot.positionRules.map((rule) => rule.code)).size !== 4)
    throw new Error("fantasy_position_rules_incomplete");
  for (const rule of snapshot.positionRules) {
    Object.assign(goal, { [rule.code]: rule.goal_points });
    Object.assign(cleanSheet, { [rule.code]: rule.clean_sheet_points });
  }
  const saves = get("saves", "GK");
  const concededGK = get("goals_conceded", "GK");
  const concededDEF = get("goals_conceded", "DEF");
  if (
    snapshot.scoringRules.length !== 12 ||
    saves.points !== 1 ||
    concededGK.points !== -1 ||
    concededDEF.points !== -1 ||
    !saves.threshold ||
    !concededGK.threshold ||
    !concededDEF.threshold ||
    get("appearance_short").threshold !== 1 ||
    get("appearance_full").threshold !== snapshot.ruleset.full_appearance_minutes
  )
    throw new Error("fantasy_scoring_rules_unsupported");
  return {
    appearanceShort: get("appearance_short").points,
    appearanceFull: get("appearance_full").points,
    fullAppearanceMinutes: snapshot.ruleset.full_appearance_minutes,
    assist: get("official_assist").points,
    goal,
    cleanSheet,
    goalsConcededPerPoint: { GK: concededGK.threshold, DEF: concededDEF.threshold },
    savesPerPoint: saves.threshold,
    penaltySave: get("penalty_save", "GK").points,
    penaltyMiss: get("penalty_miss").points,
    yellowCard: get("yellow_card").points,
    redCard: get("direct_red_card").points,
    secondYellowDismissal: get("second_yellow_dismissal").points,
    ownGoal: get("own_goal").points,
    bonusEnabled: false,
    playerOfMatchEnabled: false,
  };
}

/**
 * The rating rule (docs/backend/FANTASY_RATING_POINTS.md) is a reviewed ruleset
 * of its own: ruleset version 3.0, scoring version 3, on the adaptive document
 * only (appearance comes from its certified minutes). Anything else claiming
 * version 3 is refused like any unknown ruleset.
 */
function isRatingSnapshot(snapshot: ScoringSnapshot): boolean {
  if (snapshot.ruleset.version !== RATING_RULESET_VERSION) return false;
  if (
    snapshot.scoringVersion !== RATING_SCORING_VERSION ||
    snapshot.ruleset.minor_version !== 0 ||
    snapshot.adaptive !== true
  )
    throw new Error("fantasy_scoring_rules_unsupported");
  return true;
}

export function calculateSnapshotResults(snapshot: ScoringSnapshot) {
  const rating = isRatingSnapshot(snapshot);
  const rules = rating ? null : scoringRules(snapshot);
  const totals = new Map(
    snapshot.players.map((player) => [player.fantasyPlayerId, { points: 0, minutes: 0 }]),
  );
  if (totals.size !== snapshot.players.length) throw new Error("fantasy_duplicate_player");
  const seen = new Set<string>();
  const playerResults = snapshot.playerFixtures.map((player) => {
    const key = `${player.fantasyPlayerId}:${player.fixtureId}`;
    if (seen.has(key)) throw new Error("fantasy_duplicate_fixture_stats");
    seen.add(key);
    const total = totals.get(player.fantasyPlayerId);
    if (!total) throw new Error("fantasy_scoring_player_missing");
    // Explicit zero events retract corrected statistics; never filter them.
    const events = rating
      ? scoreRatingPlayerFixture(
          player.playerId,
          player.fixtureId,
          // He appeared when his minutes are established (as the adaptive
          // scorer requires for `appearance`) and above zero.
          certified(
            "minutes",
            player.stats,
            (player.evidence ?? {}) as FieldEvidence,
            player.scoringMode === "simple",
          ) && (player.stats.minutes ?? 0) > 0,
          player.rating ?? null,
        )
      : snapshot.adaptive
        ? scoreCertifiedPlayerFixture(
            player.playerId,
            player.fixtureId,
            player.position,
            player.stats,
            (player.evidence ?? {}) as FieldEvidence,
            rules!,
            player.scoringMode ?? null,
          )
        : scorePlayerFixture(
            player.playerId,
            player.fixtureId,
            player.position,
            statsSchema.parse(player.stats),
            rules!,
          );
    total.points += events.reduce((sum, event) => sum + event.points, 0);
    total.minutes += player.stats.minutes ?? 0;
    return { fantasyPlayerId: player.fantasyPlayerId, fixtureId: player.fixtureId, events };
  });
  const formation = snapshot.positionRules.map((rule) => ({
    position: rule.code,
    minimum: rule.starting_minimum,
    maximum: rule.starting_maximum,
  }));
  const teamResults = snapshot.teams.map((team) => {
    if (
      new Set(team.players.map((player) => player.id)).size !== 15 ||
      team.players.filter((player) => player.starter).length !== 11 ||
      team.players.filter((player) => player.captain).length !== 1 ||
      team.players.filter((player) => player.viceCaptain).length !== 1
    )
      throw new Error("fantasy_scoring_lineup_invalid");
    const players = team.players.map((player) => {
      const total = totals.get(player.id);
      if (!total) throw new Error("fantasy_scoring_player_missing");
      return { ...player, didPlay: total.minutes > 0 };
    });
    const benchBoost = team.chipType === "bench_boost";
    const participationPending = team.players.some((player) =>
      snapshot.pendingPlayerIds?.includes(player.id),
    );
    const { substitutions, effectiveCaptainId } = participationPending
      ? {
          substitutions: [],
          effectiveCaptainId:
            players.find((player) => player.captain && player.didPlay)?.id ?? null,
        }
      : calculateAutomaticSubstitutions(players, formation, benchBoost);
    const selected = new Set(players.filter((player) => player.starter).map((player) => player.id));
    for (const sub of substitutions) {
      selected.delete(sub.playerOutId);
      selected.add(sub.playerInId);
    }
    let startingPoints = 0;
    let benchPoints = 0;
    let captainPoints = 0;
    const multipliers = players.map((player) => {
      const points = totals.get(player.id)!.points;
      if (selected.has(player.id)) startingPoints += points;
      else if (!player.starter) benchPoints += points;
      let multiplier = selected.has(player.id) || benchBoost ? 1 : 0;
      if (multiplier && player.id === effectiveCaptainId) {
        multiplier =
          team.chipType === "triple_captain"
            ? snapshot.ruleset.triple_captain_multiplier
            : snapshot.ruleset.captain_multiplier;
        captainPoints = points * (multiplier - 1);
      }
      return { fantasyPlayerId: player.id, multiplier };
    });
    return {
      teamId: team.teamId,
      lineupId: team.lineupId,
      startingPoints,
      benchPoints,
      captainPoints,
      transferHit: team.transferHit,
      provisionalScore:
        startingPoints + (benchBoost ? benchPoints : 0) + captainPoints - team.transferHit,
      effectiveCaptainId,
      substitutions,
      players: multipliers,
    };
  });
  return { playerResults, teamResults };
}

export interface FantasyWorkerGateway {
  rpc(name: string, args: Record<string, unknown>): Promise<unknown>;
}

/**
 * The error a gateway throws for a failed RPC. The message is the safe code
 * that reaches logs; `postgrestCode` keeps PostgREST's own code (never its
 * message), so a caller can tell a function this database does not have yet
 * (`PGRST202`) from a call that failed.
 */
export function rpcFailure(code: string, postgrestCode: string | undefined): Error {
  return Object.assign(new Error(code), { postgrestCode });
}

// --- A write that timed out is ambiguous ---------------------------------------
//
// A client-side timeout says nothing about the database: the statement may still
// be queued, running, or about to commit. That is a different state from an RPC
// that answered with an error (the transaction was rolled back). A gateway that
// gives up on a RPC which may write throws the error below, and the pass then
// stops and keeps its lease (runFantasyWorkerPass). Aborting the HTTP request is
// a courtesy to the client, never evidence that the database stopped.

/** RPCs that only read Fantasy data: abandoning one leaves nothing in doubt. */
const READ_ONLY_RPCS: ReadonlySet<string> = new Set([
  "service_fantasy_lifecycle_state",
  "service_fantasy_scoring_league_page",
  "service_fantasy_worker_status",
]);

/** The lease and the run log: they never write Fantasy data, so a timeout there leaves no write in doubt. */
const CONTROL_RPCS: ReadonlySet<string> = new Set([
  "service_fantasy_worker_lease_acquire",
  "service_fantasy_worker_lease_extend",
  "service_fantasy_worker_lease_release",
  "service_fantasy_worker_record_run",
]);

/** True unless the RPC is known to be read-only or a lease/log call: an unknown name is treated as a write. */
export function rpcMayWrite(name: string): boolean {
  return !READ_ONLY_RPCS.has(name) && !CONTROL_RPCS.has(name);
}

/**
 * `answered`: the database really replied to the original request (with data or
 * with an error), so the statement is over. `unsettled`: it did not within the
 * grace, or the client gave up for another reason; nothing is known.
 */
export type RpcSettlement = "answered" | "unsettled";

export interface AmbiguousRpcTimeout extends Error {
  readonly ambiguous: true;
  /** The RPC whose write may still be running. */
  readonly rpc: string;
  /**
   * Waits up to `graceMs` for the original request to answer. When it does not,
   * the request is aborted as a courtesy and `unsettled` is returned: an abort
   * is never read as a cancellation.
   */
  settle(graceMs: number): Promise<RpcSettlement>;
}

/** The message stays `fantasy_worker_rpc_timeout`, the code every log and record already carries. */
export function ambiguousRpcTimeout(
  rpc: string,
  settle: (graceMs: number) => Promise<RpcSettlement>,
): AmbiguousRpcTimeout {
  return Object.assign(new Error("fantasy_worker_rpc_timeout"), {
    ambiguous: true as const,
    rpc,
    settle,
  });
}

export function isAmbiguousRpcTimeout(error: unknown): error is AmbiguousRpcTimeout {
  return (
    error instanceof Error &&
    (error as { ambiguous?: unknown }).ambiguous === true &&
    typeof (error as { settle?: unknown }).settle === "function"
  );
}

/** Gameweeks one prize pass may evaluate; the RPC accepts 1..100. */
export const PRIZE_EVALUATION_LIMIT = 10;

export const prizeEvaluationSchema = z.object({
  evaluatedCount: integer.min(0),
  evaluated: z.array(
    z.object({
      seasonId: uuid,
      gameweekId: uuid,
      gameweekNumber: positive,
      outcome: z.record(z.string(), z.unknown()),
    }),
  ),
  blocked: z.array(z.object({ seasonId: uuid, reason: z.string() }).passthrough()),
  hasMore: z.boolean(),
});
export type PrizeEvaluation = z.infer<typeof prizeEvaluationSchema>;
export type PrizeEvaluationSummary =
  | {
      evaluatedCount: number;
      hasMore: boolean;
      blocked: string[];
      gameweeks: { gameweekNumber: number; tiers: Record<string, string> }[];
    }
  | { skipped: "prizes_not_installed" }
  | { error: string };

/**
 * Status-only summary of `api.service_evaluate_fantasy_prizes`. Worker output
 * and orchestrator evidence carry which tier was awarded, never a winner,
 * team or user id.
 */
export function summarizePrizeEvaluation(evaluation: PrizeEvaluation): PrizeEvaluationSummary {
  const statusOf = (value: unknown) => {
    const status = (value as { status?: unknown } | null)?.status;
    return typeof status === "string" && /^[a-z][a-z_]{1,40}$/.test(status) ? status : "unknown";
  };
  return {
    evaluatedCount: evaluation.evaluatedCount,
    hasMore: evaluation.hasMore,
    blocked: evaluation.blocked.map((item) => item.reason),
    gameweeks: evaluation.evaluated.map((item) => ({
      gameweekNumber: item.gameweekNumber,
      tiers: Object.fromEntries(
        Object.entries(item.outcome).map(([tier, value]) => [tier, statusOf(value)]),
      ),
    })),
  };
}

/**
 * Prize evaluation is a follow-on of a finalized gameweek, never a gate: a
 * failure is reported, retried by the hourly orchestrator, and never stops the
 * next gameweek from opening. The one exception is a write that timed out and
 * may still be running (ambiguousRpcTimeout), which is rethrown.
 *
 * Between this code reaching `main` and the prize migration being promoted,
 * the database has no such function. That window is expected, not a failure,
 * so it is reported as `skipped` rather than as an error.
 */
export async function evaluateFantasyPrizes(
  call: (name: string, args: Record<string, unknown>) => Promise<unknown>,
): Promise<PrizeEvaluationSummary> {
  try {
    return summarizePrizeEvaluation(
      prizeEvaluationSchema.parse(
        await call("service_evaluate_fantasy_prizes", { p_limit: PRIZE_EVALUATION_LIMIT }),
      ),
    );
  } catch (error) {
    // Never swallowed: a prize write that may still be running must stop the pass
    // and keep its lease, like any other write (see ambiguousRpcTimeout).
    if (isAmbiguousRpcTimeout(error)) throw error;
    if ((error as { postgrestCode?: unknown } | null)?.postgrestCode === "PGRST202")
      return { skipped: "prizes_not_installed" };
    return {
      error:
        error instanceof Error && /^[a-z][a-z0-9_]{2,100}$/.test(error.message)
          ? error.message
          : "fantasy_prize_evaluation_failed",
    };
  }
}
export interface FantasyWorkerOptions {
  gameweekId: string;
  calculationVersion: number;
  batchSize?: number;
  maxBatches?: number;
}

/** A bounded one-shot worker. Every durable operation is a guarded database RPC. */
export async function runFantasyLifecycle(
  gateway: FantasyWorkerGateway,
  options: FantasyWorkerOptions,
) {
  const gameweekId = uuid.parse(options.gameweekId);
  let calculationVersion = positive.parse(options.calculationVersion);
  const batchSize = positive.max(100).parse(options.batchSize ?? 100);
  const maxBatches = positive.max(10000).parse(options.maxBatches ?? 5000);
  let calls = 0;
  const call = async (name: string, args: Record<string, unknown>) => {
    if (++calls > maxBatches) throw new Error("fantasy_worker_batch_limit");
    return gateway.rpc(name, args);
  };
  let state = lifecycleSchema.parse(
    await call("service_fantasy_lifecycle_state", { p_gameweek_id: gameweekId }),
  );
  if (state.gameweekId !== gameweekId) throw new Error("fantasy_worker_scope_mismatch");
  const adaptiveEnabled = state.adaptiveScoringEnabled === true;
  let incrementalEnabled = state.incrementalScoringEnabled === true;
  let refreshIncrementalCapability = state.status === "open";
  const expectedSeasonId = state.seasonId;
  const nextGameweekId = state.nextGameweekId ?? null;
  // Opens the next gameweek (resumable pages). At a staged close the version is the
  // close's; at the lock the database recognises a gameweek it already opened.
  const openNextGameweek = async (version: number) => {
    if (!nextGameweekId) return { nextGameweekId: null, nextGameweekStatus: "not_staged" };
    do {
      const page = z
        .object({
          prepared: integer.min(0),
          hasMore: z.boolean(),
          nextGameweekId: uuid,
          status,
          alreadyAdvanced: z.boolean(),
        })
        .parse(
          await call("service_prepare_next_fantasy_gameweek", {
            p_previous_gameweek_id: gameweekId,
            p_next_gameweek_id: nextGameweekId,
            p_calculation_version: version,
            p_batch_size: batchSize,
          }),
        );
      if (page.nextGameweekId !== nextGameweekId) throw new Error("fantasy_worker_scope_mismatch");
      if (!page.hasMore) return { nextGameweekId, nextGameweekStatus: page.status };
      if (!page.prepared) throw new Error("fantasy_worker_no_progress");
    } while (calls <= maxBatches);
    throw new Error("fantasy_worker_batch_limit");
  };
  const restoreAndRollFreeTransfers = async () => {
    do {
      const result = z.object({ restored: integer.min(0), hasMore: z.boolean() }).parse(
        await call("service_restore_free_hit", {
          p_gameweek_id: gameweekId,
          p_batch_size: batchSize,
        }),
      );
      if (!result.hasMore) break;
      if (result.restored === 0) throw new Error("fantasy_worker_no_progress");
    } while (calls <= maxBatches);
    do {
      const result = z.object({ updated: integer.min(0) }).parse(
        await call("service_roll_fantasy_free_transfers", {
          p_gameweek_id: gameweekId,
          p_batch_size: batchSize,
        }),
      );
      if (result.updated === 0) break;
    } while (calls <= maxBatches);
  };
  // Staged statistics: what the next gameweek needs, done on provisional points
  // (Free Hit squads, free transfers, prices), then the next gameweek opens.
  // Every step is idempotent, so an interrupted close is resumed here.
  const runCloseSteps = async (version: number) => {
    await restoreAndRollFreeTransfers();
    let afterPlayerId: string | null = null;
    do {
      const page = z.object({ afterPlayerId: uuid.nullable(), hasMore: z.boolean() }).parse(
        await call("service_run_fantasy_close_price_batch", {
          p_gameweek_id: gameweekId,
          p_calculation_version: version,
          p_after_player_id: afterPlayerId,
          p_batch_size: batchSize,
        }),
      );
      if (!page.hasMore) break;
      if (!page.afterPlayerId || page.afterPlayerId === afterPlayerId)
        throw new Error("fantasy_worker_cursor_invalid");
      afterPlayerId = page.afterPlayerId;
    } while (calls <= maxBatches);
    z.object({ completed: z.literal(true) }).parse(
      await call("service_complete_fantasy_close", {
        p_gameweek_id: gameweekId,
        p_calculation_version: version,
      }),
    );
    return openNextGameweek(version);
  };
  const finishPublishedWork = async () => {
    if (state.closedAt) {
      // The close already applied the prices: adopt that pass, never repeat it.
      await call("service_adopt_fantasy_close_prices", {
        p_gameweek_id: gameweekId,
        p_calculation_version: calculationVersion,
      });
    } else {
      let afterPlayerId: string | null = null;
      do {
        const page = z.object({ afterPlayerId: uuid.nullable(), hasMore: z.boolean() }).parse(
          await call("service_run_fantasy_price_batch", {
            p_gameweek_id: gameweekId,
            p_calculation_version: calculationVersion,
            p_after_player_id: afterPlayerId,
            p_batch_size: batchSize,
          }),
        );
        if (!page.hasMore) break;
        if (!page.afterPlayerId || page.afterPlayerId === afterPlayerId)
          throw new Error("fantasy_worker_cursor_invalid");
        afterPlayerId = page.afterPlayerId;
      } while (calls <= maxBatches);
    }
    let afterNotificationTeamId: string | null = null;
    do {
      const page = z
        .object({ scanned: integer.min(0), nextCursor: uuid.nullable(), hasMore: z.boolean() })
        .parse(
          await call("service_enqueue_gameweek_finalized_notifications", {
            p_gameweek_id: gameweekId,
            p_calculation_version: calculationVersion,
            p_after_team_id: afterNotificationTeamId,
            p_limit: batchSize,
          }),
        );
      if (!page.hasMore) break;
      if (!page.nextCursor || page.nextCursor === afterNotificationTeamId || page.scanned === 0)
        throw new Error("fantasy_worker_cursor_invalid");
      afterNotificationTeamId = page.nextCursor;
    } while (calls <= maxBatches);
    z.object({ completed: z.literal(true) }).parse(
      await call("service_complete_fantasy_postwork", {
        p_gameweek_id: gameweekId,
        p_calculation_version: calculationVersion,
      }),
    );
    // Winners are computed only once the gameweek is final and its postwork is
    // durable; see evaluateFantasyPrizes for why this never throws.
    const prizes = await evaluateFantasyPrizes(call);
    return { ...(await openNextGameweek(calculationVersion)), prizes };
  };
  if (state.status === "finalized") {
    if (state.scoringInputVersion !== calculationVersion)
      throw new Error("fantasy_calculation_version_mismatch");
    if (state.advancedToGameweekId && state.postworkCompleted !== false)
      return {
        outcome: "already_advanced",
        gameweekId,
        nextGameweekId: state.advancedToGameweekId,
        calls,
      };
    const progression = await finishPublishedWork();
    return { outcome: "already_finalized", gameweekId, ...progression, calls };
  }
  if (state.adaptiveScoringEnabled) {
    await call("service_select_fantasy_scoring_modes", { p_gameweek_id: gameweekId });
    const fresh = lifecycleSchema.parse(
      await call("service_fantasy_lifecycle_state", { p_gameweek_id: gameweekId }),
    );
    calculationVersion = Math.max(calculationVersion, fresh.scoringInputVersion);
    // The mode selection may have changed what the staged gate and the re-score need.
    if (fresh.gameweekId === gameweekId && fresh.seasonId === expectedSeasonId) state = fresh;
  }
  const staged = state.stagedStatsEnabled === true;
  if (staged && state.status === "provisional" && state.closedAt) {
    const closeVersion = positive.parse(state.closedCalculationVersion);
    // An interrupted close (or opening) is resumed with the close's own version.
    if (!state.closeCompleted || (nextGameweekId && !state.advancedToGameweekId)) {
      const progression = await runCloseSteps(closeVersion);
      return {
        outcome: "closed",
        gameweekId,
        calculationVersion: closeVersion,
        ...progression,
        calls,
      };
    }
    // Nothing changed and the lock is not due: provisional points stand.
    if (!state.stagedRescoreNeeded && state.stagedLockBlocker)
      return {
        outcome: "points_published",
        gameweekId,
        calculationVersion,
        reason: "awaiting_final_statistics",
        blocker: state.stagedLockBlocker,
        calls,
      };
  }
  let staleRereads = 0;
  while (["open", "locked", "live"].includes(state.status)) {
    let advanced: unknown;
    try {
      advanced = await call("service_advance_fantasy_lifecycle", {
        p_gameweek_id: gameweekId,
        p_expected_lock_version: state.lockVersion,
        p_batch_size: batchSize,
      });
    } catch (error) {
      // Another worker (the database lifecycle tick, or a second run) moved
      // the gameweek between our read and our write. The row lock and
      // lock_version made that safe; re-read and carry on from its state
      // instead of failing the whole pass. Bounded, so a flapping row cannot
      // loop forever.
      if (!(error instanceof Error) || error.message !== "stale_update" || staleRereads >= 3)
        throw error;
      staleRereads += 1;
      state = lifecycleSchema.parse(
        await call("service_fantasy_lifecycle_state", { p_gameweek_id: gameweekId }),
      );
      if (state.gameweekId !== gameweekId || state.seasonId !== expectedSeasonId)
        throw new Error("fantasy_worker_scope_mismatch");
      incrementalEnabled = state.incrementalScoringEnabled === true;
      refreshIncrementalCapability = state.status === "open";
      continue;
    }
    state = lifecycleSchema.parse(advanced);
    // The live policy is status-gated: an open week reports false. The
    // advance RPC predates that capability and does not return it, so refresh
    // once after locking rather than waiting for the next scheduled run.
    if (refreshIncrementalCapability && state.status !== "open") {
      const fresh = lifecycleSchema.parse(
        await call("service_fantasy_lifecycle_state", { p_gameweek_id: gameweekId }),
      );
      if (fresh.gameweekId !== gameweekId || fresh.seasonId !== expectedSeasonId)
        throw new Error("fantasy_worker_scope_mismatch");
      incrementalEnabled = fresh.incrementalScoringEnabled === true;
      refreshIncrementalCapability = false;
    }
    if (state.gameweekId !== gameweekId || state.seasonId !== expectedSeasonId)
      throw new Error("fantasy_worker_scope_mismatch");
    if (!state.changed && !state.hasMore) {
      if ((adaptiveEnabled || incrementalEnabled) && state.status === "live") break;
      return { outcome: "waiting", gameweekId, reason: state.waitingReason, calls };
    }
  }
  if (
    state.status !== "provisional" &&
    state.status !== "finalizing" &&
    !((adaptiveEnabled || incrementalEnabled) && state.status === "live")
  )
    throw new Error("fantasy_lifecycle_not_activated");

  if (incrementalEnabled && state.status !== "finalizing") {
    const prepared = z
      .object({ calculationVersion: positive })
      .parse(await call("service_prepare_fantasy_live_scoring", { p_gameweek_id: gameweekId }));
    calculationVersion = prepared.calculationVersion;
  }
  let incrementalPending = false;
  let adaptivePending = false;
  let afterTeamId: string | null = null;
  let digest: string | null = null;
  let playersPersisted = false;
  let processedTeams = 0;
  do {
    const snapshot = scoringSnapshotSchema.parse(
      await call("service_get_fantasy_scoring_snapshot", {
        p_gameweek_id: gameweekId,
        p_calculation_version: calculationVersion,
        p_after_team_id: afterTeamId,
        p_batch_size: batchSize,
      }),
    );
    if (
      snapshot.gameweekId !== gameweekId ||
      snapshot.calculationVersion !== calculationVersion ||
      (digest !== null && snapshot.inputDigest !== digest)
    )
      throw new Error("fantasy_scoring_snapshot_changed");
    digest = snapshot.inputDigest;
    incrementalPending =
      (snapshot.pendingFixtures?.length ?? 0) > 0 || (snapshot.pendingPlayerIds?.length ?? 0) > 0;
    adaptivePending =
      snapshot.adaptive === true &&
      (snapshot.fixtures ?? []).some((fixture) => fixture.adaptiveReady !== true);
    if (state.status === "finalizing") {
      if (!snapshot.sealed) throw new Error("fantasy_scoring_snapshot_unsealed");
      break;
    }
    if (snapshot.sealed) throw new Error("fantasy_scoring_snapshot_state_mismatch");
    const unresolvedTeams = new Set(
      snapshot.adaptive && !snapshot.incremental
        ? snapshot.teams
            .filter((team) =>
              team.players.some((player) =>
                snapshot.playerFixtures.some(
                  (f) => f.fantasyPlayerId === player.id && f.participationKnown !== true,
                ),
              ),
            )
            .map((team) => team.teamId)
        : [],
    );
    if (unresolvedTeams.size) adaptivePending = true;
    const results = calculateSnapshotResults(snapshot);
    await call("service_persist_fantasy_scoring_results", {
      p_gameweek_id: gameweekId,
      p_calculation_version: calculationVersion,
      p_input_digest: digest,
      p_player_results: playersPersisted ? [] : results.playerResults,
      p_team_results: results.teamResults.filter((team) => !unresolvedTeams.has(team.teamId)),
    });
    playersPersisted = true;
    processedTeams += results.teamResults.length;
    if (!snapshot.hasMore) break;
    if (
      !snapshot.afterTeamId ||
      snapshot.afterTeamId === afterTeamId ||
      snapshot.teams.length === 0
    )
      throw new Error("fantasy_worker_cursor_invalid");
    afterTeamId = snapshot.afterTeamId;
  } while (calls <= maxBatches);
  const publishRankings = async () => {
    const rank = async (leagueId: string | null) => {
      for (const rankingGameweekId of [gameweekId, null])
        await call("service_recalculate_fantasy_rankings", {
          p_season_id: state.seasonId,
          p_gameweek_id: rankingGameweekId,
          p_league_id: leagueId,
          p_calculation_version: calculationVersion,
        });
    };
    await rank(null);
    let afterLeagueId: string | null = null;
    do {
      const page = z
        .object({
          leagueIds: z.array(uuid).max(100),
          afterLeagueId: uuid.nullable(),
          hasMore: z.boolean(),
        })
        .parse(
          await call("service_fantasy_scoring_league_page", {
            p_gameweek_id: gameweekId,
            p_after_league_id: afterLeagueId,
            p_batch_size: batchSize,
          }),
        );
      for (const leagueId of page.leagueIds) await rank(leagueId);
      if (!page.hasMore) break;
      if (!page.afterLeagueId || page.afterLeagueId === afterLeagueId || !page.leagueIds.length)
        throw new Error("fantasy_worker_cursor_invalid");
      afterLeagueId = page.afterLeagueId;
    } while (calls <= maxBatches);
  };
  if (!digest) throw new Error("fantasy_scoring_snapshot_missing");
  if (adaptivePending || incrementalPending || state.status === "live") {
    if (incrementalEnabled) {
      await publishRankings();
      return {
        outcome: "points_published",
        gameweekId,
        calculationVersion,
        processedTeams,
        reason: "remaining_fixtures_pending",
        calls,
      };
    }
    return { outcome: "waiting", gameweekId, reason: "adaptive_scoring_pending", calls };
  }
  if (staged && state.status === "provisional") {
    if (!state.closedAt) {
      // Every counted match has core data: close on provisional points and open the next one.
      await publishRankings();
      await call("service_begin_fantasy_close", {
        p_gameweek_id: gameweekId,
        p_calculation_version: calculationVersion,
        p_input_digest: digest,
      });
      const progression = await runCloseSteps(calculationVersion);
      return {
        outcome: "closed",
        gameweekId,
        calculationVersion,
        processedTeams,
        ...progression,
        calls,
      };
    }
    if (state.stagedLockBlocker) {
      await publishRankings();
      return {
        outcome: "points_published",
        gameweekId,
        calculationVersion,
        processedTeams,
        reason: "awaiting_final_statistics",
        blocker: state.stagedLockBlocker,
        calls,
      };
    }
  }
  await call("service_begin_fantasy_finalization", {
    p_gameweek_id: gameweekId,
    p_calculation_version: calculationVersion,
    p_input_digest: digest,
  });

  // Restarting begins at the first unfinished database row; finalized rows,
  // restored Free Hits and recorded rollover entries are independently idempotent.
  let afterResultTeamId: string | null = null;
  do {
    const result = z
      .object({ finalized: integer.min(0), afterTeamId: uuid.nullable(), hasMore: z.boolean() })
      .parse(
        await call("service_finalize_fantasy_team_results", {
          p_gameweek_id: gameweekId,
          p_calculation_version: calculationVersion,
          p_after_team_id: afterResultTeamId,
          p_batch_size: batchSize,
        }),
      );
    if (!result.hasMore) break;
    if (!result.afterTeamId || result.afterTeamId === afterResultTeamId || result.finalized === 0)
      throw new Error("fantasy_worker_cursor_invalid");
    afterResultTeamId = result.afterTeamId;
  } while (calls <= maxBatches);
  await restoreAndRollFreeTransfers();

  await publishRankings();
  await call("service_complete_fantasy_gameweek", {
    p_gameweek_id: gameweekId,
    p_calculation_version: calculationVersion,
  });
  const progression = await finishPublishedWork();
  return {
    outcome: "finalized",
    gameweekId,
    calculationVersion,
    processedTeams,
    ...progression,
    calls,
  };
}

// --- The work list: what the calendar sync says needs the worker ---------------

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
      /**
       * A gameweek that closed on provisional points (its successor opened then) and
       * has since locked, but whose finalized notifications and postwork are still
       * owed (migration 20261013160200). Absent on an older database.
       */
      postworkPending: z.boolean().optional(),
    }),
  ),
});
export type CalendarSync = z.infer<typeof calendarSyncSchema>;

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
    } else if (
      gw.status === "finalized" &&
      ((gw.nextGameweekId && !gw.advancedToGameweekId) || gw.postworkPending === true)
    ) {
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

// --- One writer at a time: the lifecycle lease --------------------------------
//
// The Edge Function, the hourly GitHub orchestrator and the manual worker
// workflow all run the lifecycle above. They take one lease first
// (api.service_fantasy_worker_lease_acquire, migration 20261013170000): a
// single database row with a holder, a secret token and an expiry. While one
// holder has an unexpired lease no other can take it, and a holder that dies
// frees it when it expires. Every durable step stays a guarded RPC with its own
// row lock and lock_version; the lease keeps two whole passes from interleaving.

/** How long a lease lasts without being extended. */
export const WORKER_LEASE_SECONDS = 420;

function safeCode(error: unknown, fallback: string): string {
  return error instanceof Error && /^[a-z][a-z0-9_]{2,100}$/.test(error.message)
    ? error.message
    : fallback;
}

type RpcCall = (name: string, args: Record<string, unknown>) => Promise<unknown>;

const isMissingFunction = (error: unknown) =>
  (error as { postgrestCode?: unknown } | null)?.postgrestCode === "PGRST202";

const leaseAnswerSchema = z.object({
  acquired: z.boolean(),
  token: uuid.nullable().optional(),
  reason: z.string().nullable().optional(),
  holder: z.string().nullable().optional(),
  expiresAt: z.string().nullable().optional(),
});

export type WorkerLease =
  | { kind: "acquired"; token: string }
  /** Another holder has it. */
  | { kind: "held"; holder: string | null; expiresAt: string | null }
  /** The database worker is switched off (only an `edge:` holder is refused). */
  | { kind: "disabled" }
  /** This database has no lease function yet (migration 20261013170000 is not applied). */
  | { kind: "unmanaged" };

export async function acquireWorkerLease(
  call: RpcCall,
  holder: string,
  ttlSeconds = WORKER_LEASE_SECONDS,
): Promise<WorkerLease> {
  let answer: z.infer<typeof leaseAnswerSchema>;
  try {
    answer = leaseAnswerSchema.parse(
      await call("service_fantasy_worker_lease_acquire", {
        p_holder: holder,
        p_ttl_seconds: ttlSeconds,
      }),
    );
  } catch (error) {
    if (isMissingFunction(error)) return { kind: "unmanaged" };
    throw error;
  }
  if (answer.acquired && answer.token) return { kind: "acquired", token: answer.token };
  if (answer.reason === "disabled") return { kind: "disabled" };
  return { kind: "held", holder: answer.holder ?? null, expiresAt: answer.expiresAt ?? null };
}

/** Never throws: an unreleased lease simply expires. */
export async function releaseWorkerLease(call: RpcCall, token: string): Promise<boolean> {
  try {
    return (
      z
        .object({ released: z.boolean() })
        .parse(await call("service_fantasy_worker_lease_release", { p_token: token })).released ===
      true
    );
  } catch {
    return false;
  }
}

export const databaseWorkerStatusSchema = z.object({
  enabled: z.boolean(),
  databaseWorkerActive: z.boolean(),
  workPending: z.boolean(),
  lastOkAt: z.string().nullable(),
  leaseHeld: z.boolean(),
});
export type DatabaseWorkerStatus =
  | ({ installed: true } & z.infer<typeof databaseWorkerStatusSchema>)
  | { installed: false };

/**
 * Whether the database job is switched on and keeping up
 * (api.service_fantasy_worker_status). A database without the function, or a
 * failed read, answers "not installed": the caller then does the work itself,
 * which the lease makes safe.
 */
export async function databaseWorkerStatus(call: RpcCall): Promise<DatabaseWorkerStatus> {
  try {
    return {
      installed: true,
      ...databaseWorkerStatusSchema.parse(await call("service_fantasy_worker_status", {})),
    };
  } catch {
    return { installed: false };
  }
}

export interface LeasedGatewayOptions {
  token: string;
  ttlSeconds?: number;
  now?: () => number;
  /** Epoch ms after which no further RPC is started (`fantasy_worker_time_limit`). */
  deadlineAt?: number;
}

/**
 * The gateway the lifecycle runs on while a lease is held: extends the lease
 * every quarter of its length, stops with `fantasy_worker_lease_lost` if the
 * lease is gone, and with `fantasy_worker_time_limit` once the deadline has
 * passed. `calls` counts the RPCs the work made (the lease's own are not counted).
 */
export function leasedGateway(
  inner: FantasyWorkerGateway,
  options: LeasedGatewayOptions,
): FantasyWorkerGateway & { readonly calls: number } {
  const now = options.now ?? Date.now;
  const ttlSeconds = options.ttlSeconds ?? WORKER_LEASE_SECONDS;
  let lastExtended = now();
  let calls = 0;
  return {
    get calls() {
      return calls;
    },
    async rpc(name: string, args: Record<string, unknown>) {
      if (options.deadlineAt !== undefined && now() >= options.deadlineAt)
        throw new Error("fantasy_worker_time_limit");
      if (now() - lastExtended >= (ttlSeconds * 1000) / 4) {
        const extended = z.object({ extended: z.boolean() }).parse(
          await inner.rpc("service_fantasy_worker_lease_extend", {
            p_token: options.token,
            p_ttl_seconds: ttlSeconds,
          }),
        );
        if (!extended.extended) throw new Error("fantasy_worker_lease_lost");
        lastExtended = now();
      }
      calls += 1;
      return inner.rpc(name, args);
    },
  };
}

/**
 * The wall-clock wrapper alone, for a pass that holds no lease token: no RPC is
 * started after the deadline (`fantasy_worker_time_limit`).
 */
export function deadlineGateway(
  inner: FantasyWorkerGateway,
  options: { now?: () => number; deadlineAt: number },
): FantasyWorkerGateway {
  const now = options.now ?? Date.now;
  return {
    rpc(name: string, args: Record<string, unknown>) {
      if (now() >= options.deadlineAt) throw new Error("fantasy_worker_time_limit");
      return inner.rpc(name, args);
    },
  };
}

// --- The bounded pass the Edge Function runs ----------------------------------

export type WorkerPassOutcome = "ok" | "partial" | "failed" | "lease_held" | "disabled";

export interface WorkerPassGameweek {
  gameweekId: string;
  sequence: number;
  reason: WorkerRun["reason"];
  outcome: string;
  code?: string;
  calls: number;
  /** This gameweek's write timed out and may still be running (see AmbiguousRpcTimeout). */
  ambiguous?: true;
}

export interface WorkerPassOptions {
  /** `edge:<id>`; stored with the lease and the run log. */
  holder: string;
  now?: () => number;
  /** Wall-clock budget; no RPC is started after it (default 100 s of the Edge function's 150 s). */
  budgetMs?: number;
  /** Gameweeks one pass works on; the rest wait for the next tick (default 4). */
  maxGameweeks?: number;
  /** RPCs one gameweek may use (`fantasy_worker_batch_limit`, default 1500). */
  maxCallsPerGameweek?: number;
  leaseSeconds?: number;
  /**
   * Work on a database that has no lease function (migration 20261013170000 not
   * applied) instead of refusing. Off by default and never set by the scheduled
   * Edge path: that one must not run without the whole-pass lease. The wall-clock
   * budget still applies. docs/backend/FANTASY_WORKER_SCHEDULE.md.
   */
  allowUnmanaged?: boolean;
  /**
   * How long to wait, after an RPC that may write timed out, for the original
   * request to answer before giving up on it (default 10 s). Only an answer
   * releases the lease early; otherwise it is left to expire.
   */
  ambiguousGraceMs?: number;
}

/** What a pass reports when a write timed out and its fate is not known. */
export interface AmbiguousWrite {
  rpc: string;
  /** The original request answered within the grace, so the statement is over. */
  settled: boolean;
  /** Only ever true after `settled`; otherwise the lease is left to expire. */
  leaseReleased: boolean;
}

export interface WorkerPassResult {
  outcome: WorkerPassOutcome;
  startedAt: string;
  durationMs: number;
  /** Outcome or error code of the first gameweek that stopped for a reason; else of the first one. */
  workerCode: string | null;
  gameweekId: string | null;
  gameweekSequence: number | null;
  calls: number;
  gameweeks: WorkerPassGameweek[];
  skipped: SkippedTarget[];
  deferred: number;
  /** Set when the pass did not run: who holds the lease. */
  heldBy?: string | null;
  prizes?: unknown;
  /** Set when a write timed out and may still be running; the pass stopped there. */
  ambiguous?: AmbiguousWrite;
  /** Set when the pass refused to run because this lease function does not exist (deployment parity). */
  missingFunction?: string;
}

/** The code a prize result that needs attention carries, or null when it is fine or merely not installed yet. */
function prizeAttentionCode(prizes: unknown): string | null {
  if (typeof prizes !== "object" || prizes === null) return null;
  const { error, blocked } = prizes as { error?: unknown; blocked?: unknown };
  if (typeof error === "string")
    return safeCode(new Error(error), "fantasy_prize_evaluation_failed");
  if (Array.isArray(blocked) && blocked.length > 0) return "fantasy_prizes_blocked";
  return null;
}

const LIMIT_CODES = new Set([
  "fantasy_worker_time_limit",
  "fantasy_worker_batch_limit",
  "fantasy_worker_lease_lost",
]);

/**
 * One bounded pass: take the lease, sync the calendar, run the lifecycle for the
 * gameweeks that have work (selectWorkerTargets, the same list the orchestrator
 * uses), release the lease. Stops when the budget is spent or a gameweek used
 * its RPC allowance; every step is idempotent and resumable, so the next tick
 * carries on (docs/backend/FANTASY_WORKER_SCHEDULE.md). Never calls a provider.
 */
export async function runFantasyWorkerPass(
  gateway: FantasyWorkerGateway,
  options: WorkerPassOptions,
): Promise<WorkerPassResult> {
  const clock = options.now ?? Date.now;
  const startedMs = clock();
  const budgetMs = options.budgetMs ?? 100_000;
  const maxGameweeks = options.maxGameweeks ?? 4;
  const maxCalls = options.maxCallsPerGameweek ?? 1500;
  const deadlineAt = startedMs + budgetMs;
  let passError: string | null = null;
  /** A prize problem that made an otherwise ok pass partial. */
  let prizeCode: string | null = null;
  const finish = (
    outcome: WorkerPassOutcome,
    extra: Partial<WorkerPassResult> = {},
  ): WorkerPassResult => {
    const gameweeks = extra.gameweeks ?? [];
    const notable =
      gameweeks.find((gw) => gw.ambiguous) ?? gameweeks.find((gw) => gw.code) ?? gameweeks[0];
    return {
      outcome,
      startedAt: new Date(startedMs).toISOString(),
      durationMs: Math.max(0, clock() - startedMs),
      workerCode: passError ?? prizeCode ?? (notable ? (notable.code ?? notable.outcome) : null),
      gameweekId: notable?.gameweekId ?? null,
      gameweekSequence: notable?.sequence ?? null,
      calls: gameweeks.reduce((sum, gw) => sum + gw.calls, 0),
      gameweeks,
      skipped: [],
      deferred: 0,
      ...extra,
    };
  };

  const lease = await acquireWorkerLease(
    (name, args) => gateway.rpc(name, args),
    options.holder,
    options.leaseSeconds,
  );
  if (lease.kind === "disabled") return finish("disabled");
  if (lease.kind === "held") return finish("lease_held", { heldBy: lease.holder });
  // `unmanaged`: this database has no lease function, so the deployment is behind
  // (migration 20261013170000). The scheduled path refuses rather than run
  // without the whole-pass lease; a caller that deliberately opts in (the
  // legacy, operator-run path) still gets the wall-clock wrapper.
  if (lease.kind === "unmanaged" && !options.allowUnmanaged) {
    passError = "fantasy_worker_lease_function_missing";
    return finish("failed", { missingFunction: "service_fantasy_worker_lease_acquire" });
  }
  const token = lease.kind === "acquired" ? lease.token : null;
  const worker: FantasyWorkerGateway = token
    ? leasedGateway(gateway, {
        token,
        ttlSeconds: options.leaseSeconds,
        now: clock,
        deadlineAt,
      })
    : deadlineGateway(gateway, { now: clock, deadlineAt });
  const gameweeks: WorkerPassGameweek[] = [];
  let skipped: SkippedTarget[] = [];
  let deferred = 0;
  let outcome: WorkerPassOutcome = "ok";
  let prizes: unknown;
  let ambiguousTimeout: AmbiguousRpcTimeout | null = null;
  let ambiguous: AmbiguousWrite | undefined;
  try {
    const calendar = calendarSyncSchema.parse(
      await worker.rpc("service_sync_fantasy_calendar", { p_fantasy_season_id: null }),
    );
    const selection = selectWorkerTargets(calendar, new Date(clock()));
    skipped = selection.skipped;
    const targets = selection.targets.slice(0, maxGameweeks);
    deferred = selection.targets.length - targets.length;
    if (deferred > 0) outcome = "partial";
    let stop = false;
    for (const target of targets) {
      if (stop || clock() >= deadlineAt) {
        deferred += 1;
        // Never turn a failure (an unsettled write above all) into a mere "partial".
        if (outcome === "ok") outcome = "partial";
        continue;
      }
      const row = {
        gameweekId: target.gameweekId,
        sequence: target.sequence,
        reason: target.reason,
      };
      let calls = 0;
      const counted: FantasyWorkerGateway = {
        rpc: (name, args) => {
          calls += 1;
          return worker.rpc(name, args);
        },
      };
      try {
        const result = (await runFantasyLifecycle(counted, {
          gameweekId: target.gameweekId,
          calculationVersion: target.calculationVersion,
          maxBatches: maxCalls,
        })) as { outcome?: string; reason?: string };
        gameweeks.push({
          ...row,
          outcome: result.outcome ?? "unknown",
          ...(result.reason ? { code: result.reason } : {}),
          calls,
        });
      } catch (error) {
        const code = safeCode(error, "fantasy_worker_failed");
        if (isAmbiguousRpcTimeout(error)) {
          // A write timed out and may still commit: not a settled failure. Stop
          // here (no other gameweek), keep the lease (below), name it.
          gameweeks.push({ ...row, outcome: "failed", code, calls, ambiguous: true });
          ambiguousTimeout = error;
          passError = code;
          outcome = "failed";
          stop = true;
          continue;
        }
        gameweeks.push({ ...row, outcome: "failed", code, calls });
        if (LIMIT_CODES.has(code)) {
          // Budget, not breakage: the next tick resumes from the database state.
          if (outcome === "ok") outcome = "partial";
          stop = true;
        } else {
          // Scoped to one gameweek and transactional: carry on with the others.
          outcome = "failed";
        }
      }
    }
    if (!stop && outcome !== "failed" && clock() < deadlineAt) {
      prizes = await evaluateFantasyPrizes((name, args) => worker.rpc(name, args));
      // A prize failure never stops the game (the next pass retries it, and the
      // RPC is idempotent), but it is not an ok pass either: the orchestrator
      // calls the same state `waiting`. Visible in the response and the record.
      const attention = prizeAttentionCode(prizes);
      if (attention && outcome === "ok") {
        outcome = "partial";
        prizeCode = attention;
      }
    }
  } catch (error) {
    passError = safeCode(error, "fantasy_worker_failed");
    if (isAmbiguousRpcTimeout(error)) {
      ambiguousTimeout = error;
      outcome = "failed";
    } else {
      outcome = LIMIT_CODES.has(passError) ? "partial" : "failed";
    }
  } finally {
    const raw: RpcCall = (name, args) => gateway.rpc(name, args);
    if (ambiguousTimeout) {
      // The lease is what keeps a second pass from running beside a write that
      // may still commit. First push its expiry out a full lease from now (so
      // the window holds even if this instance is cut off while waiting), then
      // give the original request a short grace to answer. Release the lease
      // only if it did; otherwise leave it to lapse by itself, which is also how
      // a crashed worker recovers. None of these steps can throw.
      if (token)
        await raw("service_fantasy_worker_lease_extend", {
          p_token: token,
          p_ttl_seconds: options.leaseSeconds ?? WORKER_LEASE_SECONDS,
        }).catch(() => undefined);
      let settled = false;
      try {
        settled =
          (await ambiguousTimeout.settle(options.ambiguousGraceMs ?? 10_000)) === "answered";
      } catch {
        settled = false;
      }
      const leaseReleased = token && settled ? await releaseWorkerLease(raw, token) : false;
      ambiguous = { rpc: ambiguousTimeout.rpc, settled, leaseReleased };
    } else if (token) {
      await releaseWorkerLease(raw, token);
    }
  }
  return finish(outcome, {
    gameweeks,
    skipped,
    deferred,
    ...(prizes ? { prizes } : {}),
    ...(ambiguous ? { ambiguous } : {}),
  });
}
