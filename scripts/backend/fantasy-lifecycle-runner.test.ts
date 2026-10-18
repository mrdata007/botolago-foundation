import { describe, expect, it } from "bun:test";
import {
  calculateSnapshotResults,
  PRIZE_EVALUATION_LIMIT,
  rpcFailure,
  runFantasyLifecycle,
  scoringSnapshotSchema,
  summarizePrizeEvaluation,
  trustedWorkerEnvironment,
  type FantasyWorkerGateway,
  type ScoringSnapshot,
} from "./fantasy-lifecycle-runner";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const gameweekId = id(1);
const seasonId = id(2);
const teamId = id(3);
const fixtureId = id(4);
const lineupId = id(5);
const digest = "a".repeat(64);
const positions = [
  "GK",
  "GK",
  "DEF",
  "DEF",
  "DEF",
  "DEF",
  "DEF",
  "MID",
  "MID",
  "MID",
  "MID",
  "MID",
  "FWD",
  "FWD",
  "FWD",
] as const;
const starters = new Set([1, 3, 4, 5, 6, 8, 9, 10, 11, 13, 14]);
function snapshot(): ScoringSnapshot {
  const players = positions.map((position, i) => ({
    fantasyPlayerId: id(100 + i),
    playerId: id(200 + i),
    teamId: id(300 + (i % 5)),
    position,
  }));
  return {
    gameweekId,
    calculationVersion: 1,
    inputDigest: digest,
    scoringVersion: 1,
    sealed: false,
    ruleset: {
      id: id(6),
      version: 1,
      minor_version: 1,
      captain_multiplier: 2,
      triple_captain_multiplier: 3,
      full_appearance_minutes: 60,
    },
    positionRules: [
      {
        code: "GK",
        squad_quota: 2,
        starting_minimum: 1,
        starting_maximum: 1,
        goal_points: 10,
        clean_sheet_points: 4,
      },
      {
        code: "DEF",
        squad_quota: 5,
        starting_minimum: 3,
        starting_maximum: 5,
        goal_points: 6,
        clean_sheet_points: 4,
      },
      {
        code: "MID",
        squad_quota: 5,
        starting_minimum: 2,
        starting_maximum: 5,
        goal_points: 5,
        clean_sheet_points: 1,
      },
      {
        code: "FWD",
        squad_quota: 3,
        starting_minimum: 1,
        starting_maximum: 3,
        goal_points: 4,
        clean_sheet_points: 0,
      },
    ],
    scoringRules: [
      { category: "appearance_short", points: 1, threshold: 1, positionCode: null },
      { category: "appearance_full", points: 2, threshold: 60, positionCode: null },
      { category: "official_assist", points: 3, threshold: null, positionCode: null },
      { category: "saves", points: 1, threshold: 3, positionCode: "GK" },
      { category: "penalty_save", points: 5, threshold: null, positionCode: "GK" },
      { category: "goals_conceded", points: -1, threshold: 2, positionCode: "GK" },
      { category: "goals_conceded", points: -1, threshold: 2, positionCode: "DEF" },
      { category: "penalty_miss", points: -2, threshold: null, positionCode: null },
      { category: "yellow_card", points: -1, threshold: null, positionCode: null },
      { category: "direct_red_card", points: -3, threshold: null, positionCode: null },
      { category: "second_yellow_dismissal", points: -3, threshold: null, positionCode: null },
      { category: "own_goal", points: -2, threshold: null, positionCode: null },
    ],
    features: {
      bonus_points_enabled: false,
      player_of_match_enabled: false,
      official_assists_only: true,
      inferred_assists_enabled: false,
    },
    players,
    playerFixtures: players.map((player) => ({
      ...player,
      fixtureId,
      sourceSequence: 1,
      stats: {
        minutes: 90,
        goals: 0,
        assists: 0,
        cleanSheet: false,
        goalsConceded: 0,
        saves: 0,
        penaltiesSaved: 0,
        penaltiesMissed: 0,
        yellowCards: 0,
        redCards: 0,
        secondYellowDismissals: 0,
        ownGoals: 0,
        bonus: 0,
        playerOfMatchPoints: 0,
      },
    })),
    teams: [
      {
        teamId,
        lineupId,
        chipType: null,
        transferHit: 4,
        players: players.map((player, i) => ({
          id: player.fantasyPlayerId,
          position: player.position,
          starter: starters.has(i + 1),
          benchOrder: starters.has(i + 1) ? null : [2, 7, 12, 15].indexOf(i + 1) + 1,
          captain: i === 7,
          viceCaptain: i === 12,
        })),
      },
    ],
    afterTeamId: teamId,
    hasMore: false,
  };
}

describe("trusted Fantasy snapshot calculation", () => {
  it("scores the official snapshot and retains zero events for corrections", () => {
    const result = calculateSnapshotResults(scoringSnapshotSchema.parse(snapshot()));
    expect(result.teamResults[0]).toMatchObject({
      startingPoints: 22,
      benchPoints: 8,
      captainPoints: 2,
      transferHit: 4,
      provisionalScore: 20,
    });
    expect(
      result.playerResults[0]!.events.some(
        (event) => event.category === "goal" && event.points === 0,
      ),
    ).toBeTrue();
    expect(
      result.playerResults[0]!.events.find((event) => event.category === "goal")!.sourceKey,
    ).toBe(`fixture-stats:${fixtureId}:${id(200)}:goal`);
  });

  it("aggregates multiple fixtures without double-counting captain bonuses", () => {
    const input = snapshot();
    input.playerFixtures.push(
      ...input.playerFixtures.map((player) => ({ ...player, fixtureId: id(7) })),
    );
    expect(calculateSnapshotResults(input).teamResults[0]).toMatchObject({
      startingPoints: 44,
      benchPoints: 16,
      captainPoints: 4,
      provisionalScore: 44,
    });
  });

  it("uses the vice-captain and a valid bench replacement when the captain does not play", () => {
    const input = snapshot();
    input.playerFixtures[7]!.stats.minutes = 0;
    const result = calculateSnapshotResults(input).teamResults[0]!;
    expect(result.effectiveCaptainId).toBe(id(112));
    expect(result.substitutions[0]?.playerOutId).toBe(id(107));
    expect(result.players.find((player) => player.fantasyPlayerId === id(107))?.multiplier).toBe(0);
    expect(result.players.find((player) => player.fantasyPlayerId === id(112))?.multiplier).toBe(2);
    expect(result.provisionalScore).toBe(20);
  });

  it("scores the players of a match taken out of the gameweek as players who did not play", () => {
    // app_private.fantasy_resolve_frozen_assignment (20260926003500) supersedes
    // the match's assignment, so the scoring input has no statistics row at
    // all for its players: not a row of 0 minutes, none.
    const input = snapshot();
    const out = new Set([id(102), id(107)]); // a starting defender, and the captain
    input.playerFixtures = input.playerFixtures.filter(
      (player) => !out.has(player.fantasyPlayerId),
    );
    const result = calculateSnapshotResults(input);
    expect(result.playerResults.some((player) => out.has(player.fantasyPlayerId))).toBeFalse();
    const team = result.teamResults[0]!;
    // Bench in order: the goalkeeper cannot replace a defender, the defender
    // can; the midfielder then replaces the captain. The vice-captain takes
    // the armband.
    expect(team.substitutions).toEqual([
      { playerOutId: id(102), playerInId: id(106), reason: "outfield_did_not_play" },
      { playerOutId: id(107), playerInId: id(111), reason: "outfield_did_not_play" },
    ]);
    expect(team.effectiveCaptainId).toBe(id(112));
    expect(team.players.find((player) => player.fantasyPlayerId === id(107))?.multiplier).toBe(0);
    expect(team.players.find((player) => player.fantasyPlayerId === id(112))?.multiplier).toBe(2);
    expect(team).toMatchObject({
      startingPoints: 22,
      benchPoints: 4,
      captainPoints: 2,
      provisionalScore: 20,
    });
  });

  it("applies Bench Boost and Triple Captain according to the snapshot ruleset", () => {
    const boosted = snapshot();
    boosted.teams[0]!.chipType = "bench_boost";
    expect(calculateSnapshotResults(boosted).teamResults[0]!.provisionalScore).toBe(28);
    const tripled = snapshot();
    tripled.teams[0]!.chipType = "triple_captain";
    expect(calculateSnapshotResults(tripled).teamResults[0]!.provisionalScore).toBe(22);
  });

  it("rejects unsupported rules and duplicate fixture snapshots", () => {
    const unknown = snapshot();
    unknown.features.bonus_points_enabled = true;
    expect(() => calculateSnapshotResults(unknown)).toThrow("fantasy_scoring_rules_unsupported");
    const duplicate = snapshot();
    duplicate.playerFixtures.push(duplicate.playerFixtures[0]!);
    expect(() => calculateSnapshotResults(duplicate)).toThrow("fantasy_duplicate_fixture_stats");
  });
});

/** Shaped like api.service_evaluate_fantasy_prizes after GW4 of a season closes block 1. */
const prizeEvaluation = {
  evaluatedCount: 1,
  evaluated: [
    {
      seasonId,
      gameweekId,
      gameweekNumber: 4,
      outcome: {
        gameweek: {
          status: "awarded",
          winnerId: id(40),
          fantasyTeamId: teamId,
          points: 70,
          tieBreak: "outright",
          skipped: 0,
        },
        monthly: {
          blockNumber: 1,
          firstGameweekNumber: 1,
          lastGameweekNumber: 4,
          status: "no_active_prize",
        },
      },
    },
  ],
  blocked: [],
  hasMore: false,
};

type Call = { name: string; args: Record<string, unknown> };
function harness(initialStatus = "provisional") {
  const calls: Call[] = [];
  const state = {
    gameweekId,
    seasonId,
    status: initialStatus,
    lockVersion: 4,
    sequenceNumber: 1,
    scoringInputVersion: initialStatus === "finalized" ? 1 : 0,
    nextGameweekId: null as string | null,
    advancedToGameweekId: null as string | null,
  };
  const gateway: FantasyWorkerGateway = {
    async rpc(name, args) {
      calls.push({ name, args });
      switch (name) {
        case "service_fantasy_lifecycle_state":
          return state;
        case "service_advance_fantasy_lifecycle":
          return { ...state, changed: false, hasMore: false, waitingReason: "football_not_final" };
        case "service_get_fantasy_scoring_snapshot":
          return { ...snapshot(), sealed: initialStatus === "finalizing" };
        case "service_persist_fantasy_scoring_results":
          return {
            playersPersisted: 15,
            teamsPersisted: 1,
            inputDigest: digest,
            calculationVersion: 1,
          };
        case "service_begin_fantasy_finalization":
          return { sealed: true };
        case "service_finalize_fantasy_team_results":
          return { finalized: 1, afterTeamId: teamId, hasMore: false };
        case "service_restore_free_hit":
          return { restored: 0, hasMore: false };
        case "service_roll_fantasy_free_transfers":
          return { updated: 0 };
        case "service_recalculate_fantasy_rankings":
          return { updated: 1 };
        case "service_fantasy_scoring_league_page":
          return { leagueIds: [id(8)], afterLeagueId: id(8), hasMore: false };
        case "service_complete_fantasy_gameweek":
          return { finalized: true };
        case "service_run_fantasy_price_batch":
          return { updatedMemberships: 0, afterPlayerId: id(114), hasMore: false };
        case "service_enqueue_gameweek_finalized_notifications":
          return { scanned: 1, enqueued: 1, skipped: 0, nextCursor: teamId, hasMore: false };
        case "service_complete_fantasy_postwork":
          return { completed: true };
        case "service_evaluate_fantasy_prizes":
          return prizeEvaluation;
        case "service_prepare_next_fantasy_gameweek":
          return {
            prepared: 1,
            hasMore: false,
            nextGameweekId: state.nextGameweekId,
            status: "open",
            alreadyAdvanced: false,
          };
        default:
          throw new Error(`unexpected_rpc_${name}`);
      }
    },
  };
  return { gateway, calls, state };
}

describe("bounded manual Fantasy pipeline", () => {
  it("persists real computed results, seals, completes all rankings, then prices and in-app events", async () => {
    const { gateway, calls } = harness();
    expect(
      (await runFantasyLifecycle(gateway, { gameweekId, calculationVersion: 1 })).outcome,
    ).toBe("finalized");
    const names = calls.map((call) => call.name);
    expect(names.indexOf("service_persist_fantasy_scoring_results")).toBeLessThan(
      names.indexOf("service_begin_fantasy_finalization"),
    );
    expect(names.indexOf("service_complete_fantasy_gameweek")).toBeGreaterThan(
      names.lastIndexOf("service_recalculate_fantasy_rankings"),
    );
    expect(names.indexOf("service_run_fantasy_price_batch")).toBeGreaterThan(
      names.indexOf("service_complete_fantasy_gameweek"),
    );
    expect(names.at(-2)).toBe("service_complete_fantasy_postwork");
    expect(names.at(-1)).toBe("service_evaluate_fantasy_prizes");
    const results = calls.find((call) => call.name === "service_persist_fantasy_scoring_results")!
      .args.p_team_results as { provisionalScore: number }[];
    expect(results[0]!.provisionalScore).toBe(20);
    expect(
      calls.filter((call) => call.name === "service_recalculate_fantasy_rankings"),
    ).toHaveLength(4);
    expect(
      calls.find((call) => call.name === "service_run_fantasy_price_batch")!.args
        .p_calculation_version,
    ).toBe(1);
  });

  it("waits for canonical final football and performs no scoring writes", async () => {
    const { gateway, calls } = harness("live");
    expect(
      (await runFantasyLifecycle(gateway, { gameweekId, calculationVersion: 1 })).outcome,
    ).toBe("waiting");
    expect(calls.map((call) => call.name)).toEqual([
      "service_fantasy_lifecycle_state",
      "service_advance_fantasy_lifecycle",
    ]);
  });

  it("re-reads and carries on when another worker moved the gameweek first", async () => {
    // The database lifecycle tick locked GW1 between this run's read and its
    // write: the advance answers stale_update. That is not a failure.
    const calls: string[] = [];
    let advances = 0;
    const base = {
      gameweekId,
      seasonId,
      lockVersion: 1,
      sequenceNumber: 1,
      scoringInputVersion: 0,
      nextGameweekId: null,
      advancedToGameweekId: null,
    };
    const gateway: FantasyWorkerGateway = {
      async rpc(name) {
        calls.push(name);
        if (name === "service_fantasy_lifecycle_state")
          return calls.length === 1
            ? { ...base, status: "open" }
            : { ...base, status: "locked", lockVersion: 2 };
        if (name === "service_advance_fantasy_lifecycle") {
          advances += 1;
          if (advances === 1) throw rpcFailure("stale_update", "PT409");
          return {
            ...base,
            status: "locked",
            lockVersion: 2,
            changed: false,
            hasMore: false,
            waitingReason: "football_not_started",
          };
        }
        throw new Error(`unexpected ${name}`);
      },
    };
    const result = await runFantasyLifecycle(gateway, { gameweekId, calculationVersion: 1 });
    expect(result).toMatchObject({ outcome: "waiting", reason: "football_not_started" });
    expect(calls).toEqual([
      "service_fantasy_lifecycle_state",
      "service_advance_fantasy_lifecycle",
      "service_fantasy_lifecycle_state",
      "service_advance_fantasy_lifecycle",
    ]);
  });

  it("still fails when the gameweek keeps moving under it", async () => {
    const gateway: FantasyWorkerGateway = {
      async rpc(name) {
        if (name === "service_advance_fantasy_lifecycle") throw rpcFailure("stale_update", "PT409");
        return {
          gameweekId,
          seasonId,
          status: "open",
          lockVersion: 1,
          sequenceNumber: 1,
          scoringInputVersion: 0,
        };
      },
    };
    await expect(
      runFantasyLifecycle(gateway, { gameweekId, calculationVersion: 1 }),
    ).rejects.toThrow("stale_update");
  });

  it("resumes finalizing without rewriting persisted player/team results", async () => {
    const { gateway, calls } = harness("finalizing");
    await runFantasyLifecycle(gateway, { gameweekId, calculationVersion: 1 });
    expect(
      calls.some((call) => call.name === "service_persist_fantasy_scoring_results"),
    ).toBeFalse();
    expect(calls.some((call) => call.name === "service_finalize_fantasy_team_results")).toBeTrue();
  });

  it("resumes post-finalization work instead of returning before prices and notifications", async () => {
    const { gateway, calls } = harness("finalized");
    const result = await runFantasyLifecycle(gateway, { gameweekId, calculationVersion: 1 });
    expect(result.outcome).toBe("already_finalized");
    expect(calls.map((call) => call.name)).toEqual([
      "service_fantasy_lifecycle_state",
      "service_run_fantasy_price_batch",
      "service_enqueue_gameweek_finalized_notifications",
      "service_complete_fantasy_postwork",
      "service_evaluate_fantasy_prizes",
    ]);
    const wrong = harness("finalized");
    await expect(
      runFantasyLifecycle(wrong.gateway, { gameweekId, calculationVersion: 2 }),
    ).rejects.toThrow("fantasy_calculation_version_mismatch");
  });

  it("prepares only the existing next gameweek after durable postwork and resumes batches", async () => {
    const { gateway, calls, state } = harness("finalized");
    state.nextGameweekId = id(99);
    const original = gateway.rpc.bind(gateway);
    let batches = 0;
    gateway.rpc = async (name, args) => {
      const result = await original(name, args);
      return name === "service_prepare_next_fantasy_gameweek"
        ? {
            ...(result as object),
            hasMore: ++batches === 1,
            status: batches === 1 ? "scheduled" : "open",
          }
        : result;
    };
    const result = await runFantasyLifecycle(gateway, { gameweekId, calculationVersion: 1 });
    expect(result).toMatchObject({ nextGameweekId: id(99), nextGameweekStatus: "open" });
    const names = calls.map((call) => call.name);
    expect(names.indexOf("service_prepare_next_fantasy_gameweek")).toBeGreaterThan(
      names.indexOf("service_complete_fantasy_postwork"),
    );
    expect(batches).toBe(2);
    expect(calls.at(-1)?.args.p_next_gameweek_id).toBe(id(99));
  });

  it("does not repeat historical price work after the next gameweek has opened", async () => {
    const { gateway, calls, state } = harness("finalized");
    state.nextGameweekId = id(99);
    state.advancedToGameweekId = id(99);
    expect(await runFantasyLifecycle(gateway, { gameweekId, calculationVersion: 1 })).toMatchObject(
      { outcome: "already_advanced", nextGameweekId: id(99) },
    );
    expect(calls.map((call) => call.name)).toEqual(["service_fantasy_lifecycle_state"]);
  });

  it("does not open a next gameweek when postwork completion fails", async () => {
    const { gateway, calls, state } = harness("finalized");
    state.nextGameweekId = id(99);
    const original = gateway.rpc.bind(gateway);
    gateway.rpc = async (name, args) => {
      if (name === "service_complete_fantasy_postwork")
        throw new Error("fantasy_notifications_incomplete");
      return original(name, args);
    };
    await expect(
      runFantasyLifecycle(gateway, { gameweekId, calculationVersion: 1 }),
    ).rejects.toThrow("fantasy_notifications_incomplete");
    expect(calls.some((call) => call.name === "service_prepare_next_fantasy_gameweek")).toBeFalse();
    expect(calls.some((call) => call.name === "service_evaluate_fantasy_prizes")).toBeFalse();
  });

  it("evaluates prizes once postwork is durable and before the next gameweek opens", async () => {
    const { gateway, calls, state } = harness("finalized");
    state.nextGameweekId = id(99);
    await runFantasyLifecycle(gateway, { gameweekId, calculationVersion: 1 });
    const names = calls.map((call) => call.name);
    expect(names.indexOf("service_evaluate_fantasy_prizes")).toBeGreaterThan(
      names.indexOf("service_complete_fantasy_postwork"),
    );
    expect(names.indexOf("service_evaluate_fantasy_prizes")).toBeLessThan(
      names.indexOf("service_prepare_next_fantasy_gameweek"),
    );
    expect(calls.find((call) => call.name === "service_evaluate_fantasy_prizes")?.args).toEqual({
      p_limit: PRIZE_EVALUATION_LIMIT,
    });
  });

  it("reports the prize pass by status only, with no winner, team or user id", async () => {
    const { gateway } = harness("finalized");
    const result = await runFantasyLifecycle(gateway, { gameweekId, calculationVersion: 1 });
    expect(result).toMatchObject({
      prizes: {
        evaluatedCount: 1,
        hasMore: false,
        blocked: [],
        gameweeks: [
          { gameweekNumber: 4, tiers: { gameweek: "awarded", monthly: "no_active_prize" } },
        ],
      },
    });
    expect(JSON.stringify((result as { prizes: unknown }).prizes)).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-/,
    );
  });

  it("never lets a prize failure stop the next gameweek from opening", async () => {
    const { gateway, calls, state } = harness("finalized");
    state.nextGameweekId = id(99);
    const original = gateway.rpc.bind(gateway);
    gateway.rpc = async (name, args) => {
      if (name === "service_evaluate_fantasy_prizes") {
        calls.push({ name, args });
        throw new Error("fantasy_worker_rpc_failed");
      }
      return original(name, args);
    };
    const result = await runFantasyLifecycle(gateway, { gameweekId, calculationVersion: 1 });
    expect(result).toMatchObject({
      outcome: "already_finalized",
      nextGameweekId: id(99),
      nextGameweekStatus: "open",
      prizes: { error: "fantasy_worker_rpc_failed" },
    });
    expect(calls.some((call) => call.name === "service_prepare_next_fantasy_gameweek")).toBeTrue();
  });

  it("reports prizes as not installed, not failed, until the prize migration is promoted", async () => {
    const { gateway, state } = harness("finalized");
    state.nextGameweekId = id(99);
    const original = gateway.rpc.bind(gateway);
    gateway.rpc = async (name, args) => {
      if (name === "service_evaluate_fantasy_prizes")
        throw rpcFailure("fantasy_worker_rpc_failed", "PGRST202");
      return original(name, args);
    };
    expect(await runFantasyLifecycle(gateway, { gameweekId, calculationVersion: 1 })).toMatchObject(
      {
        nextGameweekId: id(99),
        nextGameweekStatus: "open",
        prizes: { skipped: "prizes_not_installed" },
      },
    );
  });

  it("reduces an unrecognised prize failure or payload to one safe code", async () => {
    const { gateway, state } = harness("finalized");
    state.nextGameweekId = null;
    const original = gateway.rpc.bind(gateway);
    gateway.rpc = async (name, args) =>
      name === "service_evaluate_fantasy_prizes" ? { unexpected: true } : original(name, args);
    expect(await runFantasyLifecycle(gateway, { gameweekId, calculationVersion: 1 })).toMatchObject(
      { nextGameweekStatus: "not_staged", prizes: { error: "fantasy_prize_evaluation_failed" } },
    );
  });

  it("persists the full player snapshot once across team pages and detects digest changes", async () => {
    const { gateway, calls } = harness();
    const base = gateway.rpc.bind(gateway);
    gateway.rpc = async (name, args) => {
      if (name !== "service_get_fantasy_scoring_snapshot") return base(name, args);
      calls.push({ name, args });
      const input = snapshot();
      if (!args.p_after_team_id) return { ...input, hasMore: true, afterTeamId: teamId };
      return {
        ...input,
        teams: [{ ...input.teams[0]!, teamId: id(9), lineupId: id(10) }],
        afterTeamId: id(9),
      };
    };
    await runFantasyLifecycle(gateway, { gameweekId, calculationVersion: 1 });
    const persisted = calls.filter(
      (call) => call.name === "service_persist_fantasy_scoring_results",
    );
    expect((persisted[0]!.args.p_player_results as unknown[]).length).toBe(15);
    expect(persisted[1]!.args.p_player_results).toEqual([]);

    const changed = harness();
    const original = changed.gateway.rpc.bind(changed.gateway);
    changed.gateway.rpc = async (name, args) =>
      name === "service_get_fantasy_scoring_snapshot"
        ? {
            ...snapshot(),
            hasMore: !args.p_after_team_id,
            inputDigest: args.p_after_team_id ? "b".repeat(64) : digest,
          }
        : original(name, args);
    await expect(
      runFantasyLifecycle(changed.gateway, { gameweekId, calculationVersion: 1 }),
    ).rejects.toThrow("fantasy_scoring_snapshot_changed");
    expect(
      changed.calls.some((call) => call.name === "service_begin_fantasy_finalization"),
    ).toBeFalse();
  });

  it("stops on a persistence failure before any result can be marked final", async () => {
    const { gateway, calls } = harness();
    const original = gateway.rpc.bind(gateway);
    gateway.rpc = async (name, args) => {
      if (name === "service_persist_fantasy_scoring_results") throw new Error("stale_update");
      return original(name, args);
    };
    await expect(
      runFantasyLifecycle(gateway, { gameweekId, calculationVersion: 1 }),
    ).rejects.toThrow("stale_update");
    expect(
      calls.some(
        (call) =>
          call.name.includes("finalization") || call.name === "service_complete_fantasy_gameweek",
      ),
    ).toBeFalse();
  });

  it("enforces operation bounds without a busy retry loop", async () => {
    const { gateway } = harness();
    await expect(
      runFantasyLifecycle(gateway, { gameweekId, calculationVersion: 1, maxBatches: 2 }),
    ).rejects.toThrow("fantasy_worker_batch_limit");
  });
});

describe("prize evaluation summary", () => {
  it("keeps tier statuses and drops anything that is not a plain status word", () => {
    expect(
      summarizePrizeEvaluation({
        evaluatedCount: 1,
        evaluated: [
          {
            seasonId,
            gameweekId,
            gameweekNumber: 30,
            outcome: {
              season: { status: "awarded", winnerId: id(41) },
              miniLeagues: { status: "evaluated", leagues: [{ leagueId: id(42) }] },
              odd: { status: "<b>" },
              bare: "awarded",
            },
          },
        ],
        blocked: [{ seasonId, reason: "season_gameweek_count_too_small", gameweekCount: 30 }],
        hasMore: true,
      }),
    ).toEqual({
      evaluatedCount: 1,
      hasMore: true,
      blocked: ["season_gameweek_count_too_small"],
      gameweeks: [
        {
          gameweekNumber: 30,
          tiers: { season: "awarded", miniLeagues: "evaluated", odd: "unknown", bare: "unknown" },
        },
      ],
    });
  });
});

describe("manual worker authorization", () => {
  const env = {
    FANTASY_MANUAL_WORKER_ENABLED: "true",
    SUPABASE_PRODUCTION_PROJECT_REF: "tkewgajrljbwgwedqsxn",
    SUPABASE_PRODUCTION_URL: "https://tkewgajrljbwgwedqsxn.supabase.co",
    SUPABASE_SECRET_KEY: "test-server-only",
    GITHUB_REPOSITORY: "mrdata007/botolago-foundation",
    GITHUB_REF: "refs/heads/main",
    GITHUB_EVENT_NAME: "workflow_dispatch",
    GITHUB_ACTOR: "mrdata007",
    GITHUB_RUN_ATTEMPT: "1",
    EXPECTED_COMMIT: "a".repeat(40),
    GITHUB_SHA: "a".repeat(40),
    CONFIRMATION: "RUN_FANTASY_MANUAL_WORKER",
    FANTASY_GAMEWEEK_ID: gameweekId,
    FANTASY_CALCULATION_VERSION: "1",
  };
  it("requires explicit enablement and rejects scheduled, wrong-project and stale-commit contexts", () => {
    expect(() => trustedWorkerEnvironment({})).toThrow("fantasy_worker_disabled");
    for (const update of [
      { GITHUB_EVENT_NAME: "schedule" },
      { SUPABASE_PRODUCTION_PROJECT_REF: "wrong" },
      { EXPECTED_COMMIT: "b".repeat(40) },
      { GITHUB_RUN_ATTEMPT: "2" },
    ])
      expect(() => trustedWorkerEnvironment({ ...env, ...update })).toThrow(
        "fantasy_worker_environment_mismatch",
      );
    expect(trustedWorkerEnvironment(env).gameweekId).toBe(gameweekId);
  });
});

describe("adaptive fixture integration", () => {
  function adaptive() {
    const doc = snapshot();
    doc.adaptive = true;
    doc.scoringVersion = 2;
    doc.ruleset.version = 2;
    doc.playerFixtures = doc.playerFixtures.map((p) => ({
      ...p,
      scoringMode: "full",
      participationKnown: true,
      evidence: Object.fromEntries(
        Object.keys(p.stats).map((field) => [
          field,
          {
            state: "verified",
            source: "test",
            observedAt: "2026-09-27T00:00:00Z",
            references: ["test:fixture"],
          },
        ]),
      ),
    }));
    return doc;
  }
  it("preserves full team totals, captain and bench rules", () => {
    expect(calculateSnapshotResults(adaptive())).toEqual(calculateSnapshotResults(snapshot()));
  });
  it("mixes full and simple fixtures within a double gameweek", () => {
    const doc = adaptive();
    doc.playerFixtures[7]!.stats.assists = 2;
    doc.playerFixtures.push({
      ...doc.playerFixtures[7]!,
      fixtureId: id(999),
      scoringMode: "simple",
    });
    const results = calculateSnapshotResults(doc);
    const captainEvents = results.playerResults.filter((p) => p.fantasyPlayerId === id(107));
    expect(captainEvents[0]!.events.find((e) => e.category === "assist")!.points).toBe(6);
    expect(captainEvents[1]!.events.some((e) => e.category === "assist")).toBeFalse();
    expect(results.teamResults[0]!.captainPoints).toBe(10);
  });
  it("preserves promotion, substitutions and chips across mixed fixtures", () => {
    for (const [chipType, expectedScore, expectedCaptain] of [
      [null, 36, 10],
      ["triple_captain", 46, 20],
      ["bench_boost", 42, 10],
    ] as const) {
      const doc = adaptive();
      doc.teams[0]!.chipType = chipType;
      doc.playerFixtures[7]!.stats.minutes = 0;
      doc.playerFixtures[7]!.scoringMode = "simple";
      doc.playerFixtures[12]!.scoringMode = "simple";
      doc.playerFixtures.push({
        ...doc.playerFixtures[12]!,
        fixtureId: id(999),
        scoringMode: "full",
        stats: { ...doc.playerFixtures[12]!.stats, assists: 2 },
      });
      const result = calculateSnapshotResults(doc).teamResults[0]!;
      expect(result.captainPoints).toBe(expectedCaptain);
      expect(result.provisionalScore).toBe(expectedScore);
      expect(result.substitutions.length).toBe(chipType === "bench_boost" ? 0 : 1);
    }
  });
  it("saves provisional player facts while unknown participation blocks lineup finalization", async () => {
    const calls: Call[] = [];
    const doc = adaptive();
    doc.fixtures = [{ adaptiveReady: false }];
    doc.playerFixtures[7]!.participationKnown = false;
    const gateway: FantasyWorkerGateway = {
      async rpc(name, args) {
        calls.push({ name, args });
        if (name === "service_fantasy_lifecycle_state")
          return {
            gameweekId,
            seasonId,
            status: "provisional",
            lockVersion: 1,
            sequenceNumber: 1,
            scoringInputVersion: 1,
            adaptiveScoringEnabled: true,
          };
        if (name === "service_select_fantasy_scoring_modes") return { enabled: true };
        if (name === "service_get_fantasy_scoring_snapshot") return doc;
        if (name === "service_persist_fantasy_scoring_results") return {};
        throw new Error(name);
      },
    };
    expect(
      (await runFantasyLifecycle(gateway, { gameweekId, calculationVersion: 1 })).outcome,
    ).toBe("waiting");
    expect(
      calls.find((c) => c.name === "service_persist_fantasy_scoring_results")!.args.p_team_results,
    ).toEqual([]);
    expect(calls.some((c) => c.name === "service_begin_fantasy_finalization")).toBeFalse();
  });
});

describe("rating gameweek (docs/backend/FANTASY_RATING_POINTS.md)", () => {
  /** A rating snapshot: ruleset 3.0, scoring version 3, adaptive, every rating 6.0 by default. */
  function rating(overrides: Record<number, number | null> = {}) {
    const doc = snapshot();
    doc.adaptive = true;
    doc.scoringVersion = 3;
    doc.ruleset.version = 3;
    doc.ruleset.minor_version = 0;
    doc.playerFixtures = doc.playerFixtures.map((p, i) => ({
      ...p,
      scoringMode: "simple",
      participationKnown: true,
      rating: i in overrides ? overrides[i]! : 6.0,
      evidence: Object.fromEntries(
        Object.keys(p.stats).map((field) => [
          field,
          {
            state: "verified",
            source: "sofascore",
            observedAt: "2026-10-18T00:00:00Z",
            references: ["sofascore:event:1"],
          },
        ]),
      ),
    }));
    return doc;
  }
  // Starters 0,2,3,4,5,7,8,9,10,12,13; bench 1 (GK), 6 (DEF), 11 (MID), 14 (FWD).
  // Player 0: 7.5 -> 8; player 2: actual API rating 5; player 3: 7.49 -> 7; captain 7: 8.5 -> 9;
  // everyone else 6.0 -> 6. Starters 8+5+7+6+6+9+6+6+6+6+6 = 71, bench 24, hit 4.
  const ratings = { 0: 7.5, 2: 5, 3: 7.49, 7: 8.5 };

  it("gives each appearing player one event from his actual API rating, rounded half up", () => {
    const result = calculateSnapshotResults(scoringSnapshotSchema.parse(rating(ratings)));
    const eventsOf = (i: number) =>
      result.playerResults.find((p) => p.fantasyPlayerId === id(100 + i))!.events;
    expect(eventsOf(0)).toEqual([
      { category: "rating", points: 8, sourceKey: `fixture-stats:${fixtureId}:${id(200)}:rating` },
    ]);
    expect(eventsOf(2)[0]!.points).toBe(5);
    expect(eventsOf(3)[0]!.points).toBe(7);
    expect(eventsOf(7)[0]!.points).toBe(9);
    for (const player of result.playerResults) expect(player.events.length).toBe(1);
  });

  it("refuses missing ratings before computing totals, captaincy or substitutions", () => {
    for (const index of [0, 1, 7, 14]) {
      const doc = rating({ [index]: null });
      expect(() => calculateSnapshotResults(doc)).toThrow("fantasy_ratings_pending");
      doc.playerFixtures[index]!.rating = 6;
      expect(() => calculateSnapshotResults(doc)).not.toThrow();
      doc.playerFixtures[index]!.rating = null;
      doc.playerFixtures[index]!.stats.minutes = 0;
      expect(() => calculateSnapshotResults(doc)).not.toThrow();
    }
  });

  it("waits before any result, ranking or finalization write, then resumes on a rated snapshot", async () => {
    const h = harness();
    let rated = false;
    const gateway: FantasyWorkerGateway = {
      async rpc(name, args) {
        if (name === "service_get_fantasy_scoring_snapshot") {
          h.calls.push({ name, args });
          return rating(rated ? {} : { 7: null });
        }
        return h.gateway.rpc(name, args);
      },
    };
    expect(await runFantasyLifecycle(gateway, { gameweekId, calculationVersion: 1 })).toMatchObject(
      {
        outcome: "waiting",
        reason: "fantasy_ratings_pending",
      },
    );
    expect(h.calls.some((c) => /persist|rankings|finaliz/.test(c.name))).toBeFalse();
    rated = true;
    await runFantasyLifecycle(gateway, { gameweekId, calculationVersion: 1 });
    expect(h.calls.some((c) => c.name === "service_persist_fantasy_scoring_results")).toBeTrue();
  });

  it("doubles the captain and keeps the transfer hit", () => {
    expect(calculateSnapshotResults(rating(ratings)).teamResults[0]).toMatchObject({
      startingPoints: 71,
      benchPoints: 24,
      captainPoints: 9,
      transferHit: 4,
      provisionalScore: 76,
      effectiveCaptainId: id(107),
    });
  });

  it("applies Triple Captain and Bench Boost as before", () => {
    const tripled = rating(ratings);
    tripled.teams[0]!.chipType = "triple_captain";
    expect(calculateSnapshotResults(tripled).teamResults[0]).toMatchObject({
      captainPoints: 18,
      provisionalScore: 85,
    });
    const boosted = rating(ratings);
    boosted.teams[0]!.chipType = "bench_boost";
    expect(calculateSnapshotResults(boosted).teamResults[0]).toMatchObject({
      benchPoints: 24,
      provisionalScore: 100,
      substitutions: [],
    });
  });

  it("gives 0 to a starter who did not play and brings on the bench", () => {
    const doc = rating(ratings);
    doc.playerFixtures[4]!.stats.minutes = 0;
    const result = calculateSnapshotResults(doc);
    expect(result.playerResults.find((p) => p.fantasyPlayerId === id(104))!.events).toEqual([]);
    const team = result.teamResults[0]!;
    expect(team.substitutions).toEqual([
      { playerOutId: id(104), playerInId: id(106), reason: "outfield_did_not_play" },
    ]);
    expect(team).toMatchObject({ startingPoints: 71, benchPoints: 18, provisionalScore: 76 });
  });

  it("hands the armband to the vice-captain when the captain did not play", () => {
    const doc = rating(ratings);
    doc.playerFixtures[7]!.stats.minutes = 0;
    const team = calculateSnapshotResults(doc).teamResults[0]!;
    expect(team.effectiveCaptainId).toBe(id(112));
    expect(team.substitutions[0]).toEqual({
      playerOutId: id(107),
      playerInId: id(106),
      reason: "outfield_did_not_play",
    });
    // 71 - 9 (captain out) + 6 (bench defender in) = 68, vice-captain doubled: +6, hit -4.
    expect(team).toMatchObject({ startingPoints: 68, captainPoints: 6, provisionalScore: 70 });
  });

  it("does not score a player whose participation is not established", () => {
    const doc = rating(ratings);
    delete (doc.playerFixtures[9]!.evidence as Record<string, unknown>).minutes;
    const result = calculateSnapshotResults(doc);
    expect(result.playerResults.find((p) => p.fantasyPlayerId === id(109))!.events).toEqual([]);
  });

  it("sums the fixtures of a double gameweek, one rating event each", () => {
    const doc = rating(ratings);
    doc.playerFixtures.push({ ...doc.playerFixtures[8]!, fixtureId: id(999), rating: 9.5 });
    const result = calculateSnapshotResults(doc);
    const rows = result.playerResults.filter((p) => p.fantasyPlayerId === id(108));
    expect(rows.map((row) => row.events)).toEqual([
      [
        {
          category: "rating",
          points: 6,
          sourceKey: `fixture-stats:${fixtureId}:${id(208)}:rating`,
        },
      ],
      [{ category: "rating", points: 10, sourceKey: `fixture-stats:${id(999)}:${id(208)}:rating` }],
    ]);
    expect(result.teamResults[0]).toMatchObject({ startingPoints: 81, provisionalScore: 86 });
  });

  it("accepts ruleset 3.0 only as the reviewed rating rule", () => {
    expect(() => calculateSnapshotResults(rating())).not.toThrow();
    const wrongVersion = rating();
    wrongVersion.scoringVersion = 2;
    expect(() => calculateSnapshotResults(wrongVersion)).toThrow(
      "fantasy_scoring_rules_unsupported",
    );
    const notAdaptive = rating();
    notAdaptive.adaptive = false;
    expect(() => calculateSnapshotResults(notAdaptive)).toThrow(
      "fantasy_scoring_rules_unsupported",
    );
    const minor = rating();
    minor.ruleset.minor_version = 1;
    expect(() => calculateSnapshotResults(minor)).toThrow("fantasy_scoring_rules_unsupported");
    const unknown = rating();
    unknown.ruleset.version = 4;
    unknown.scoringVersion = 4;
    expect(() => calculateSnapshotResults(unknown)).toThrow("fantasy_scoring_rules_unsupported");
  });

  it("refuses a rating outside 0..10 in the snapshot", () => {
    expect(() => scoringSnapshotSchema.parse(rating({ 0: 11 }))).toThrow();
  });

  it("leaves a v2 snapshot exactly as it was, whatever ratings it carries", () => {
    const v2 = rating(ratings);
    v2.scoringVersion = 2;
    v2.ruleset.version = 2;
    v2.ruleset.minor_version = 1;
    const plain = rating(ratings);
    plain.scoringVersion = 2;
    plain.ruleset.version = 2;
    plain.ruleset.minor_version = 1;
    for (const p of plain.playerFixtures) delete p.rating;
    expect(calculateSnapshotResults(v2)).toEqual(calculateSnapshotResults(plain));
    expect(
      calculateSnapshotResults(v2).playerResults[0]!.events.some((e) => e.category === "rating"),
    ).toBeFalse();
  });
});

describe("fixture-ready publication", () => {
  it("publishes team totals and all ranking scopes while leaving the gameweek open", async () => {
    const base = harness("live");
    const live = snapshot();
    live.incremental = true;
    live.pendingFixtures = [{}];
    live.pendingPlayerIds = [live.players[7]!.fantasyPlayerId];
    live.playerFixtures = live.playerFixtures.filter(
      (p) => p.fantasyPlayerId !== live.players[7]!.fantasyPlayerId,
    );
    const gateway: FantasyWorkerGateway = {
      async rpc(name, args) {
        if (name === "service_fantasy_lifecycle_state")
          return { ...base.state, incrementalScoringEnabled: true };
        if (name === "service_prepare_fantasy_live_scoring") return { calculationVersion: 1 };
        if (name === "service_get_fantasy_scoring_snapshot") return live;
        return base.gateway.rpc(name, args);
      },
    };
    const result = await runFantasyLifecycle(gateway, { gameweekId, calculationVersion: 1 });
    expect(result.outcome).toBe("points_published");
    expect(
      base.calls.filter((c) => c.name === "service_recalculate_fantasy_rankings"),
    ).toHaveLength(4);
    expect(base.calls.some((c) => c.name === "service_begin_fantasy_finalization")).toBe(false);
    const persisted = base.calls.find((c) => c.name === "service_persist_fantasy_scoring_results")!;
    expect(
      (
        persisted.args.p_team_results as Array<{
          effectiveCaptainId: string | null;
          substitutions: unknown[];
        }>
      )[0],
    ).toMatchObject({ effectiveCaptainId: null, substitutions: [] });
  });
  it("keeps the original captain and bench pending until participation settles", () => {
    const live = snapshot();
    const captain = live.players[7]!.fantasyPlayerId;
    live.incremental = true;
    live.pendingPlayerIds = [captain];
    live.playerFixtures = live.playerFixtures.filter((p) => p.fantasyPlayerId !== captain);
    let result = calculateSnapshotResults(live).teamResults[0]!;
    expect(result.effectiveCaptainId).toBeNull();
    expect(result.substitutions).toEqual([]);
    live.pendingPlayerIds = [];
    result = calculateSnapshotResults(live).teamResults[0]!;
    expect(result.effectiveCaptainId).toBe(live.players[12]!.fantasyPlayerId);
    expect(result.substitutions).toHaveLength(1);
  });
  it("counts eligible double-fixture points, bench boost and triple captain without duplication", () => {
    const live = snapshot();
    live.incremental = true;
    live.pendingPlayerIds = [live.players[0]!.fantasyPlayerId];
    live.playerFixtures.push({ ...live.playerFixtures[7]!, fixtureId: id(999) });
    live.teams[0]!.chipType = "triple_captain";
    const result = calculateSnapshotResults(live).teamResults[0]!;
    expect(result.captainPoints).toBe(8);
    expect(result.provisionalScore).toBe(28);
    expect(result.substitutions).toEqual([]);
    live.teams[0]!.chipType = "bench_boost";
    expect(calculateSnapshotResults(live).teamResults[0]!.provisionalScore).toBe(32);
  });
});

describe("season transition reliability", () => {
  for (const nextStatus of ["live", "provisional"] as const) {
    it(`refreshes scoring capability when an open week becomes ${nextStatus}`, async () => {
      const base = harness("open");
      let current = "open";
      let prepared = false;
      const gateway: FantasyWorkerGateway = {
        async rpc(name, args) {
          if (name === "service_fantasy_lifecycle_state")
            return {
              ...base.state,
              status: current,
              incrementalScoringEnabled: current !== "open",
            };
          if (name === "service_advance_fantasy_lifecycle") {
            const changed = current === "open";
            current = nextStatus;
            return { ...base.state, status: current, changed, hasMore: false };
          }
          if (name === "service_prepare_fantasy_live_scoring") {
            prepared = true;
            return { calculationVersion: 7 };
          }
          if (name === "service_get_fantasy_scoring_snapshot") {
            expect(args.p_calculation_version).toBe(7);
            return {
              ...snapshot(),
              incremental: true,
              calculationVersion: 7,
              pendingFixtures: nextStatus === "live" ? [{}] : [],
              pendingPlayerIds: [],
            };
          }
          return base.gateway.rpc(name, args);
        },
      };
      const result = await runFantasyLifecycle(gateway, { gameweekId, calculationVersion: 1 });
      expect(prepared).toBeTrue();
      expect(result.outcome).toBe(nextStatus === "live" ? "points_published" : "finalized");
    });
  }
});

describe("RPC cost of one gameweek (docs/backend/FANTASY_WORKER_SCHEDULE.md)", () => {
  const BATCH = 100;
  const pages = (n: number) => Math.max(1, Math.ceil(n / BATCH));

  /**
   * The harness, with every cursor paged like a season of `teams` fantasy teams,
   * `leagues` leagues and `players` priced players, so the worker's RPC count can
   * be measured from the code instead of estimated.
   */
  function paged(teams: number, leagues: number, players: number) {
    const { gateway, calls, state } = harness("provisional");
    state.nextGameweekId = id(99);
    const seen: Record<string, number> = {};
    const nth = (name: string) => (seen[name] = (seen[name] ?? 0) + 1);
    const paged: FantasyWorkerGateway = {
      async rpc(name, args) {
        const n = nth(name);
        switch (name) {
          case "service_get_fantasy_scoring_snapshot": {
            const last = n >= pages(teams);
            return { ...snapshot(), hasMore: !last, afterTeamId: last ? null : id(1000 + n) };
          }
          case "service_finalize_fantasy_team_results": {
            const last = n >= pages(teams);
            return { finalized: 1, afterTeamId: last ? null : id(1000 + n), hasMore: !last };
          }
          case "service_enqueue_gameweek_finalized_notifications": {
            const last = n >= pages(teams);
            return {
              scanned: 1,
              enqueued: 1,
              skipped: 0,
              nextCursor: id(1000 + n),
              hasMore: !last,
            };
          }
          case "service_roll_fantasy_free_transfers":
            return { updated: n <= pages(teams) ? 1 : 0 };
          case "service_run_fantasy_price_batch": {
            const last = n >= pages(players);
            return { updatedMemberships: 0, afterPlayerId: id(2000 + n), hasMore: !last };
          }
          case "service_prepare_next_fantasy_gameweek": {
            const last = n >= pages(teams);
            return {
              prepared: 1,
              hasMore: !last,
              nextGameweekId: id(99),
              status: "open",
              alreadyAdvanced: false,
            };
          }
          case "service_fantasy_scoring_league_page": {
            const last = n >= pages(leagues);
            const inPage = Math.min(BATCH, leagues - (n - 1) * BATCH);
            return {
              leagueIds: Array.from({ length: Math.max(inPage, 0) }, (_, i) => id(3000 + i)),
              afterLeagueId: id(3000 + n),
              hasMore: !last,
            };
          }
          default:
            return gateway.rpc(name, args);
        }
      },
    };
    return { gateway: paged, calls };
  }

  // 1 state + 2 per score page (snapshot, persist) + begin finalization + 1 per page
  // of: team results, free-transfer roll (plus its closing empty call), notifications,
  // next-gameweek opening; restore Free Hit; 2 per ranking (overall, then one per
  // league); league pages; price pages; complete gameweek, postwork and the prize pass.
  const expected = (teams: number, leagues: number, players: number) =>
    9 + 6 * pages(teams) + pages(leagues) + 2 * leagues + pages(players);

  for (const [teams, leagues, players] of [
    [300, 20, 450],
    [1000, 100, 450],
    [5000, 500, 450],
    [20000, 2000, 450],
  ] as const) {
    it(`finalizes ${teams} teams, ${leagues} leagues in ${expected(teams, leagues, players)} RPCs`, async () => {
      const { gateway } = paged(teams, leagues, players);
      const result = await runFantasyLifecycle(gateway, {
        gameweekId,
        calculationVersion: 1,
        maxBatches: 10_000,
      });
      expect(result.outcome).toBe("finalized");
      expect(result.calls).toBe(expected(teams, leagues, players));
    });
  }

  it("runs out of its RPC allowance with a code the Edge pass treats as 'continue next tick'", async () => {
    const { gateway } = paged(5000, 500, 450);
    await expect(
      runFantasyLifecycle(gateway, { gameweekId, calculationVersion: 1, maxBatches: 600 }),
    ).rejects.toThrow("fantasy_worker_batch_limit");
  });
});
