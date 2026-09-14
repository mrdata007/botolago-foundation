import { describe, expect, it } from "bun:test";
import {
  calculateSnapshotResults,
  runFantasyLifecycle,
  scoringSnapshotSchema,
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
        case "service_apply_fantasy_price_changes":
          return { updatedMemberships: 0, afterPlayerId: id(114), hasMore: false };
        case "service_enqueue_gameweek_finalized_notifications":
          return { scanned: 1, enqueued: 1, skipped: 0, nextCursor: teamId, hasMore: false };
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
    expect(names.indexOf("service_apply_fantasy_price_changes")).toBeGreaterThan(
      names.indexOf("service_complete_fantasy_gameweek"),
    );
    expect(names.at(-1)).toBe("service_enqueue_gameweek_finalized_notifications");
    const results = calls.find((call) => call.name === "service_persist_fantasy_scoring_results")!
      .args.p_team_results as { provisionalScore: number }[];
    expect(results[0]!.provisionalScore).toBe(20);
    expect(
      calls.filter((call) => call.name === "service_recalculate_fantasy_rankings"),
    ).toHaveLength(4);
    expect(
      calls.find((call) => call.name === "service_apply_fantasy_price_changes")!.args
        .p_source_version,
    ).toBe(2);
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
      "service_apply_fantasy_price_changes",
      "service_enqueue_gameweek_finalized_notifications",
    ]);
    const wrong = harness("finalized");
    await expect(
      runFantasyLifecycle(wrong.gateway, { gameweekId, calculationVersion: 2 }),
    ).rejects.toThrow("fantasy_calculation_version_mismatch");
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
