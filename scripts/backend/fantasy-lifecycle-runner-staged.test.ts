import { describe, expect, it } from "bun:test";
import {
  runFantasyLifecycle,
  type FantasyWorkerGateway,
  type ScoringSnapshot,
} from "./fantasy-lifecycle-runner";

// Staged statistics in the lifecycle worker (docs/backend/SOFASCORE_STAGED_STATS.md).

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

type Call = { name: string; args: Record<string, unknown> };
const closeVersion = 3;
const nextId = id(50);

interface StagedState {
  status: string;
  closedAt: string | null;
  closedCalculationVersion: number | null;
  closeCompleted: boolean;
  stagedLockBlocker: string | null;
  stagedRescoreNeeded: boolean;
  advancedToGameweekId: string | null;
  postworkCompleted: boolean;
  scoringInputVersion: number;
}
const stagedState = (over: Partial<StagedState> = {}): StagedState => ({
  status: "provisional",
  closedAt: null,
  closedCalculationVersion: null,
  closeCompleted: false,
  stagedLockBlocker: "fantasy_staged_stats_not_final",
  stagedRescoreNeeded: true,
  advancedToGameweekId: null,
  postworkCompleted: false,
  scoringInputVersion: 3,
  ...over,
});

function stagedHarness(over: Partial<StagedState> = {}, pending = false) {
  const calls: Call[] = [];
  const state = stagedState(over);
  const live = snapshot();
  live.incremental = true;
  live.adaptive = true;
  live.calculationVersion = 3;
  if (pending) live.pendingFixtures = [{}];
  const gateway: FantasyWorkerGateway = {
    async rpc(name, args) {
      calls.push({ name, args });
      switch (name) {
        case "service_fantasy_lifecycle_state":
          return {
            gameweekId,
            seasonId,
            lockVersion: 4,
            sequenceNumber: 1,
            nextGameweekId: nextId,
            adaptiveScoringEnabled: true,
            incrementalScoringEnabled: true,
            stagedStatsEnabled: true,
            ...state,
          };
        case "service_select_fantasy_scoring_modes":
          return { enabled: true, staged: true };
        case "service_prepare_fantasy_live_scoring":
          return { calculationVersion: 3 };
        case "service_get_fantasy_scoring_snapshot":
          return { ...live, sealed: state.status === "finalizing" };
        case "service_persist_fantasy_scoring_results":
          return { playersPersisted: 15, teamsPersisted: 1 };
        case "service_recalculate_fantasy_rankings":
          return 1;
        case "service_fantasy_scoring_league_page":
          return { leagueIds: [id(8)], afterLeagueId: id(8), hasMore: false };
        case "service_begin_fantasy_close":
          return { closed: true };
        case "service_restore_free_hit":
          return { restored: 0, hasMore: false };
        case "service_roll_fantasy_free_transfers":
          return { updated: 0 };
        case "service_run_fantasy_close_price_batch":
          return { updatedMemberships: 0, afterPlayerId: id(114), hasMore: false };
        case "service_complete_fantasy_close":
          return { completed: true };
        case "service_prepare_next_fantasy_gameweek":
          return {
            prepared: 1,
            hasMore: false,
            nextGameweekId: nextId,
            status: "open",
            alreadyAdvanced: false,
          };
        case "service_begin_fantasy_finalization":
          return { sealed: true };
        case "service_finalize_fantasy_team_results":
          return { finalized: 1, afterTeamId: teamId, hasMore: false };
        case "service_complete_fantasy_gameweek":
          return { finalized: true };
        case "service_adopt_fantasy_close_prices":
          return { adopted: true };
        case "service_run_fantasy_price_batch":
          return { updatedMemberships: 0, afterPlayerId: id(114), hasMore: false };
        case "service_enqueue_gameweek_finalized_notifications":
          return { scanned: 1, enqueued: 1, skipped: 0, nextCursor: teamId, hasMore: false };
        case "service_complete_fantasy_postwork":
          return { completed: true };
        case "service_evaluate_fantasy_prizes":
          return { evaluatedCount: 0, evaluated: [], blocked: [], hasMore: false };
        default:
          throw new Error(`unexpected_rpc_${name}`);
      }
    },
  };
  return { gateway, calls };
}
const names = (calls: Call[]) => calls.map((c) => c.name);
const index = (calls: Call[], name: string) => names(calls).indexOf(name);

function nativeHarness(over: Partial<StagedState> = {}, pending = true) {
  const base = stagedHarness(over);
  let closedAt = over.closedAt ?? null;
  let completed = over.closeCompleted ?? false;
  let advanced = over.advancedToGameweekId ?? null;
  const gateway: FantasyWorkerGateway = {
    async rpc(name, args) {
      if (name === "service_fantasy_lifecycle_state") {
        const value = (await base.gateway.rpc(name, args)) as Record<string, unknown>;
        return {
          ...value,
          adaptiveScoringEnabled: false,
          stagedStatsEnabled: false,
          selectionCloseEnabled: true,
          selectionRatingsPending: pending,
          closedAt,
          closedCalculationVersion: closedAt ? closeVersion : null,
          closeCompleted: completed,
          advancedToGameweekId: advanced,
          stagedLockBlocker: null,
        };
      }
      if (name === "service_begin_fantasy_selection_close") {
        base.calls.push({ name, args });
        closedAt = "2026-10-20T10:00:00Z";
        return { closed: true, closeVersion, ratingsPending: pending };
      }
      if (pending && name === "service_prepare_fantasy_live_scoring")
        throw new Error("pending ratings must not prepare a scoring snapshot");
      const result = await base.gateway.rpc(name, args);
      if (name === "service_complete_fantasy_close") completed = true;
      if (name === "service_prepare_next_fantasy_gameweek") advanced = nextId;
      return result;
    },
  };
  return { gateway, calls: base.calls };
}

describe("native selection close independent of rating settlement", () => {
  it("opens the successor without preparing, persisting or finalizing pending scores", async () => {
    const { gateway, calls } = nativeHarness();
    const result = await runFantasyLifecycle(gateway, { gameweekId, calculationVersion: 3 });
    expect(result).toMatchObject({ outcome: "closed", nextGameweekStatus: "open" });
    expect(calls.find((c) => c.name === "service_begin_fantasy_selection_close")?.args).toEqual({
      p_gameweek_id: gameweekId,
      p_expected_lock_version: 4,
    });
    for (const name of [
      "service_prepare_fantasy_live_scoring",
      "service_get_fantasy_scoring_snapshot",
      "service_persist_fantasy_scoring_results",
      "service_begin_fantasy_finalization",
      "service_enqueue_gameweek_finalized_notifications",
      "service_evaluate_fantasy_prizes",
    ])
      expect(names(calls)).not.toContain(name);
    expect(names(calls).filter((n) => n === "service_run_fantasy_close_price_batch")).toHaveLength(
      1,
    );
    expect(index(calls, "service_complete_fantasy_close")).toBeLessThan(
      index(calls, "service_prepare_next_fantasy_gameweek"),
    );
  });
  it("finalizes already available ratings in the same pass and adopts the close prices", async () => {
    const { gateway, calls } = nativeHarness({}, false);
    expect(
      (await runFantasyLifecycle(gateway, { gameweekId, calculationVersion: 3 })).outcome,
    ).toBe("finalized");
    expect(index(calls, "service_begin_fantasy_selection_close")).toBeLessThan(
      index(calls, "service_prepare_fantasy_live_scoring"),
    );
    expect(names(calls).filter((n) => n === "service_run_fantasy_close_price_batch")).toHaveLength(
      1,
    );
    expect(names(calls)).toContain("service_adopt_fantasy_close_prices");
    expect(names(calls)).not.toContain("service_run_fantasy_price_batch");
  });
  it("resumes an interrupted administrative close using its original version", async () => {
    const { gateway, calls } = nativeHarness({
      closedAt: "2026-10-20T10:00:00Z",
      closedCalculationVersion: closeVersion,
    });
    expect(
      (await runFantasyLifecycle(gateway, { gameweekId, calculationVersion: 4 })).outcome,
    ).toBe("closed");
    expect(names(calls)).not.toContain("service_begin_fantasy_selection_close");
    expect(
      calls.find((c) => c.name === "service_run_fantasy_close_price_batch")?.args
        .p_calculation_version,
    ).toBe(closeVersion);
  });
  it("waits normally after carry-over without repeating economics or publishing zero points", async () => {
    const { gateway, calls } = nativeHarness({
      closedAt: "2026-10-20T10:00:00Z",
      closedCalculationVersion: closeVersion,
      closeCompleted: true,
      advancedToGameweekId: nextId,
    });
    expect(await runFantasyLifecycle(gateway, { gameweekId, calculationVersion: 3 })).toMatchObject(
      { outcome: "waiting", reason: "fantasy_ratings_pending" },
    );
    expect(names(calls)).toEqual(["service_fantasy_lifecycle_state"]);
  });
  it("later ratings finalize without rerunning the administrative price pages", async () => {
    const { gateway, calls } = nativeHarness(
      {
        closedAt: "2026-10-20T10:00:00Z",
        closedCalculationVersion: closeVersion,
        closeCompleted: true,
        advancedToGameweekId: nextId,
      },
      false,
    );
    expect(
      (await runFantasyLifecycle(gateway, { gameweekId, calculationVersion: 3 })).outcome,
    ).toBe("finalized");
    expect(names(calls)).not.toContain("service_run_fantasy_close_price_batch");
    expect(names(calls)).not.toContain("service_run_fantasy_price_batch");
    expect(names(calls)).toContain("service_adopt_fantasy_close_prices");
  });
  it("retains the capability across a live-to-provisional state transition", async () => {
    const base = nativeHarness({ status: "live" });
    const gateway: FantasyWorkerGateway = {
      async rpc(name, args) {
        if (name === "service_advance_fantasy_lifecycle") {
          base.calls.push({ name, args });
          return {
            gameweekId,
            seasonId,
            status: "provisional",
            lockVersion: 5,
            sequenceNumber: 1,
            scoringInputVersion: 3,
            changed: true,
            hasMore: false,
          };
        }
        return base.gateway.rpc(name, args);
      },
    };
    expect(
      (await runFantasyLifecycle(gateway, { gameweekId, calculationVersion: 3 })).outcome,
    ).toBe("closed");
    expect(
      base.calls.find((c) => c.name === "service_begin_fantasy_selection_close")?.args
        .p_expected_lock_version,
    ).toBe(5);
  });
});

describe("staged statistics: closing a gameweek on provisional points", () => {
  it("every match has core data: scores, closes, carries over, opens the next gameweek, does not lock", async () => {
    const { gateway, calls } = stagedHarness();
    const result = await runFantasyLifecycle(gateway, { gameweekId, calculationVersion: 3 });
    expect(result).toMatchObject({
      outcome: "closed",
      nextGameweekId: nextId,
      nextGameweekStatus: "open",
    });
    const order = [
      "service_select_fantasy_scoring_modes",
      "service_persist_fantasy_scoring_results",
      "service_begin_fantasy_close",
      "service_restore_free_hit",
      "service_roll_fantasy_free_transfers",
      "service_run_fantasy_close_price_batch",
      "service_complete_fantasy_close",
      "service_prepare_next_fantasy_gameweek",
    ].map((name) => index(calls, name));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    // Nothing that waits for the lock runs at the close.
    for (const forbidden of [
      "service_begin_fantasy_finalization",
      "service_finalize_fantasy_team_results",
      "service_complete_fantasy_gameweek",
      "service_enqueue_gameweek_finalized_notifications",
      "service_complete_fantasy_postwork",
      "service_evaluate_fantasy_prizes",
      "service_run_fantasy_price_batch",
    ])
      expect(names(calls)).not.toContain(forbidden);
    const begin = calls.find((c) => c.name === "service_begin_fantasy_close")!;
    expect(begin.args).toMatchObject({ p_calculation_version: 3, p_input_digest: digest });
    // Rankings were published (provisional totals) before the close.
    expect(index(calls, "service_recalculate_fantasy_rankings")).toBeLessThan(
      index(calls, "service_begin_fantasy_close"),
    );
  });

  it("a match still without core data keeps the gameweek from closing", async () => {
    const { gateway, calls } = stagedHarness({}, true);
    const result = await runFantasyLifecycle(gateway, { gameweekId, calculationVersion: 3 });
    expect(result.outcome).toBe("points_published");
    expect(names(calls)).not.toContain("service_begin_fantasy_close");
    expect(names(calls)).not.toContain("service_prepare_next_fantasy_gameweek");
  });

  it("an interrupted close is resumed with the close's own version, without scoring again", async () => {
    const { gateway, calls } = stagedHarness({
      closedAt: "2026-10-12T10:00:00Z",
      closedCalculationVersion: closeVersion,
      closeCompleted: false,
      scoringInputVersion: 7,
    });
    const result = await runFantasyLifecycle(gateway, { gameweekId, calculationVersion: 7 });
    expect(result).toMatchObject({ outcome: "closed", calculationVersion: closeVersion });
    expect(names(calls)).not.toContain("service_begin_fantasy_close");
    expect(names(calls)).not.toContain("service_persist_fantasy_scoring_results");
    expect(
      calls.find((c) => c.name === "service_complete_fantasy_close")!.args.p_calculation_version,
    ).toBe(closeVersion);
    expect(
      calls.find((c) => c.name === "service_prepare_next_fantasy_gameweek")!.args
        .p_calculation_version,
    ).toBe(closeVersion);
  });
});

describe("staged statistics: a closed gameweek stays updatable until it is locked", () => {
  const closed = {
    closedAt: "2026-10-12T10:00:00Z",
    closedCalculationVersion: closeVersion,
    closeCompleted: true,
    advancedToGameweekId: nextId,
  };

  it("nothing changed and matches still provisional: no re-score, reported as provisional points", async () => {
    const { gateway, calls } = stagedHarness({ ...closed, stagedRescoreNeeded: false });
    const result = await runFantasyLifecycle(gateway, { gameweekId, calculationVersion: 3 });
    expect(result).toMatchObject({
      outcome: "points_published",
      reason: "awaiting_final_statistics",
      blocker: "fantasy_staged_stats_not_final",
    });
    expect(names(calls)).not.toContain("service_persist_fantasy_scoring_results");
    expect(names(calls)).not.toContain("service_recalculate_fantasy_rankings");
  });

  it("a re-pull changed the inputs: points, team totals and every ranking scope are recomputed, still not locked", async () => {
    const { gateway, calls } = stagedHarness({ ...closed, stagedRescoreNeeded: true });
    const result = await runFantasyLifecycle(gateway, { gameweekId, calculationVersion: 3 });
    expect(result).toMatchObject({
      outcome: "points_published",
      reason: "awaiting_final_statistics",
    });
    const persisted = calls.find((c) => c.name === "service_persist_fantasy_scoring_results")!;
    expect((persisted.args.p_team_results as unknown[]).length).toBe(1);
    expect((persisted.args.p_player_results as unknown[]).length).toBeGreaterThan(0);
    // overall + gameweek for the global table and for the league
    expect(calls.filter((c) => c.name === "service_recalculate_fantasy_rankings")).toHaveLength(4);
    for (const forbidden of [
      "service_begin_fantasy_close",
      "service_begin_fantasy_finalization",
      "service_prepare_next_fantasy_gameweek",
    ])
      expect(names(calls)).not.toContain(forbidden);
  });

  it("every match FINAL or FINAL_LIMITED: the existing finalization runs, prices are adopted, not repeated", async () => {
    const { gateway, calls } = stagedHarness({
      ...closed,
      stagedRescoreNeeded: false,
      stagedLockBlocker: null,
    });
    const result = await runFantasyLifecycle(gateway, { gameweekId, calculationVersion: 3 });
    expect(result).toMatchObject({ outcome: "finalized", nextGameweekId: nextId });
    expect(names(calls)).not.toContain("service_begin_fantasy_close");
    expect(names(calls)).not.toContain("service_run_fantasy_price_batch");
    const order = [
      "service_persist_fantasy_scoring_results",
      "service_begin_fantasy_finalization",
      "service_finalize_fantasy_team_results",
      "service_complete_fantasy_gameweek",
      "service_adopt_fantasy_close_prices",
      "service_enqueue_gameweek_finalized_notifications",
      "service_complete_fantasy_postwork",
      "service_evaluate_fantasy_prizes",
    ].map((name) => index(calls, name));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("a gameweek locked but whose postwork was interrupted still gets its notifications", async () => {
    const { gateway, calls } = stagedHarness({
      ...closed,
      status: "finalized",
      postworkCompleted: false,
      stagedLockBlocker: null,
    });
    const result = await runFantasyLifecycle(gateway, { gameweekId, calculationVersion: 3 });
    expect(result.outcome).toBe("already_finalized");
    expect(names(calls)).toContain("service_adopt_fantasy_close_prices");
    expect(names(calls)).toContain("service_enqueue_gameweek_finalized_notifications");
    expect(names(calls)).toContain("service_complete_fantasy_postwork");
  });

  it("a locked gameweek with its postwork done is left alone", async () => {
    const { gateway, calls } = stagedHarness({
      ...closed,
      status: "finalized",
      postworkCompleted: true,
      stagedLockBlocker: null,
    });
    const result = await runFantasyLifecycle(gateway, { gameweekId, calculationVersion: 3 });
    expect(result.outcome).toBe("already_advanced");
    expect(names(calls)).toEqual(["service_fantasy_lifecycle_state"]);
  });
});
