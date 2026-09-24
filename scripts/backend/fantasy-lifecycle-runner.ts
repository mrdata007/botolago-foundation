import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { scorePlayerFixture, type ScoringRules } from "../../src/backend/fantasy/scoring";
import { calculateAutomaticSubstitutions } from "../../src/backend/fantasy/substitutions";

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
  seasonId: uuid,
  status,
  lockVersion: positive,
  sequenceNumber: positive,
  scoringInputVersion: integer.min(0),
  nextGameweekId: uuid.nullable().optional(),
  advancedToGameweekId: uuid.nullable().optional(),
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
        stats: statsSchema,
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
    snapshot.ruleset.version !== 1 ||
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

export function calculateSnapshotResults(snapshot: ScoringSnapshot) {
  const rules = scoringRules(snapshot);
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
    const events = scorePlayerFixture(
      player.playerId,
      player.fixtureId,
      player.position,
      player.stats,
      rules,
    );
    total.points += events.reduce((sum, event) => sum + event.points, 0);
    total.minutes += player.stats.minutes;
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
    const { substitutions, effectiveCaptainId } = calculateAutomaticSubstitutions(
      players,
      formation,
      benchBoost,
    );
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
 * next gameweek from opening.
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
  const calculationVersion = positive.parse(options.calculationVersion);
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
  const expectedSeasonId = state.seasonId;
  const nextGameweekId = state.nextGameweekId ?? null;
  const finishPublishedWork = async () => {
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
    if (!nextGameweekId) return { nextGameweekId: null, nextGameweekStatus: "not_staged", prizes };
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
            p_calculation_version: calculationVersion,
            p_batch_size: batchSize,
          }),
        );
      if (page.nextGameweekId !== nextGameweekId) throw new Error("fantasy_worker_scope_mismatch");
      if (!page.hasMore) return { nextGameweekId, nextGameweekStatus: page.status, prizes };
      if (!page.prepared) throw new Error("fantasy_worker_no_progress");
    } while (calls <= maxBatches);
    throw new Error("fantasy_worker_batch_limit");
  };
  if (state.status === "finalized") {
    if (state.scoringInputVersion !== calculationVersion)
      throw new Error("fantasy_calculation_version_mismatch");
    if (state.advancedToGameweekId)
      return {
        outcome: "already_advanced",
        gameweekId,
        nextGameweekId: state.advancedToGameweekId,
        calls,
      };
    const progression = await finishPublishedWork();
    return { outcome: "already_finalized", gameweekId, ...progression, calls };
  }
  while (["open", "locked", "live"].includes(state.status)) {
    state = lifecycleSchema.parse(
      await call("service_advance_fantasy_lifecycle", {
        p_gameweek_id: gameweekId,
        p_expected_lock_version: state.lockVersion,
        p_batch_size: batchSize,
      }),
    );
    if (state.gameweekId !== gameweekId || state.seasonId !== expectedSeasonId)
      throw new Error("fantasy_worker_scope_mismatch");
    if (!state.changed && !state.hasMore)
      return { outcome: "waiting", gameweekId, reason: state.waitingReason, calls };
  }
  if (state.status !== "provisional" && state.status !== "finalizing")
    throw new Error("fantasy_lifecycle_not_activated");

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
    if (state.status === "finalizing") {
      if (!snapshot.sealed) throw new Error("fantasy_scoring_snapshot_unsealed");
      break;
    }
    if (snapshot.sealed) throw new Error("fantasy_scoring_snapshot_state_mismatch");
    const results = calculateSnapshotResults(snapshot);
    await call("service_persist_fantasy_scoring_results", {
      p_gameweek_id: gameweekId,
      p_calculation_version: calculationVersion,
      p_input_digest: digest,
      p_player_results: playersPersisted ? [] : results.playerResults,
      p_team_results: results.teamResults,
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
  if (!digest) throw new Error("fantasy_scoring_snapshot_missing");
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

export function trustedWorkerEnvironment(env: Record<string, string | undefined>) {
  if (env.FANTASY_MANUAL_WORKER_ENABLED !== "true") throw new Error("fantasy_worker_disabled");
  if (
    env.SUPABASE_PRODUCTION_PROJECT_REF !== "tkewgajrljbwgwedqsxn" ||
    env.SUPABASE_PRODUCTION_URL?.replace(/\/$/, "") !==
      "https://tkewgajrljbwgwedqsxn.supabase.co" ||
    env.GITHUB_REPOSITORY !== "mrdata007/botolago-foundation" ||
    env.GITHUB_REF !== "refs/heads/main" ||
    env.GITHUB_EVENT_NAME !== "workflow_dispatch" ||
    env.GITHUB_ACTOR !== "mrdata007" ||
    env.GITHUB_RUN_ATTEMPT !== "1" ||
    !/^[0-9a-f]{40}$/.test(env.EXPECTED_COMMIT ?? "") ||
    env.EXPECTED_COMMIT !== env.GITHUB_SHA ||
    env.CONFIRMATION !== "RUN_FANTASY_MANUAL_WORKER"
  )
    throw new Error("fantasy_worker_environment_mismatch");
  if (!env.SUPABASE_SECRET_KEY) throw new Error("fantasy_worker_credential_missing");
  return {
    url: env.SUPABASE_PRODUCTION_URL,
    key: env.SUPABASE_SECRET_KEY,
    gameweekId: uuid.parse(env.FANTASY_GAMEWEEK_ID),
    calculationVersion: positive.parse(env.FANTASY_CALCULATION_VERSION),
  };
}

if (import.meta.main) {
  try {
    const config = trustedWorkerEnvironment(process.env);
    const api = createClient(config.url, config.key, {
      auth: { persistSession: false, autoRefreshToken: false },
      db: { schema: "api" },
    });
    const gateway: FantasyWorkerGateway = {
      async rpc(name, args) {
        const { data, error } = await api.rpc(name, args).abortSignal(AbortSignal.timeout(60000));
        if (error) {
          // Never serialize SQL details, input snapshots or credentials to logs.
          const code = /^[a-z][a-z0-9_]{2,100}$/.test(error.message)
            ? error.message
            : "fantasy_worker_rpc_failed";
          throw rpcFailure(code, error.code);
        }
        return data;
      },
    };
    process.stdout.write(`${JSON.stringify(await runFantasyLifecycle(gateway, config))}\n`);
  } catch (error) {
    const code =
      error instanceof Error && /^[a-z][a-z0-9_]{2,100}$/.test(error.message)
        ? error.message
        : "fantasy_worker_failed";
    process.stderr.write(`${JSON.stringify({ outcome: "failed", code })}\n`);
    process.exitCode = 1;
  }
}
