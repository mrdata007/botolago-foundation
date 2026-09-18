import { describe, expect, test } from "bun:test";
import {
  calendarSyncSchema,
  orchestrateFantasySeason,
  orchestratorEnvironment,
  selectWorkerTargets,
  summarizeProviderRefresh,
  type CalendarSync,
  type OrchestratorGateway,
} from "./fantasy-season-orchestrator";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const now = new Date("2026-09-24T22:00:00Z");

function calendar(
  gameweeks: Array<Partial<CalendarSync["gameweeks"][number]> & { sequence: number }>,
  overrides: Partial<CalendarSync> = {},
): CalendarSync {
  return calendarSyncSchema.parse({
    schemaVersion: 1,
    seasonId: id(1),
    seasonStatus: "active",
    expectedClubs: 16,
    gameweeksCreated: 0,
    assignmentsAdded: 0,
    assignmentsSuperseded: 0,
    kickoffsRealigned: 0,
    deadlineChanges: 0,
    blockedRounds: 0,
    rounds: [],
    gameweeks: gameweeks.map((gw) => ({
      id: id(100 + gw.sequence),
      status: "scheduled",
      deadlineAt: "2026-10-01T18:30:00Z",
      scoringInputVersion: 0,
      nextGameweekId: null,
      advancedToGameweekId: null,
      ...gw,
    })),
    ...overrides,
  });
}

/** A gateway whose lifecycle RPCs answer like a finalized, already advanced gameweek. */
function gateway(
  cal: CalendarSync,
  options: {
    lifecycle?: (name: string, args: Record<string, unknown>) => unknown;
    batches?: Array<{ fixturesProcessed: number; hasMore: boolean; nextCursor: string | null }>;
  } = {},
) {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const batches = options.batches ?? [{ fixturesProcessed: 0, hasMore: false, nextCursor: null }];
  let batchIndex = 0;
  const g: OrchestratorGateway = {
    async rpc(name, args) {
      calls.push({ name, args });
      if (name === "service_sync_fantasy_calendar") return cal;
      if (options.lifecycle) return options.lifecycle(name, args);
      if (name === "service_fantasy_lifecycle_state")
        return {
          schemaVersion: 1,
          gameweekId: args.p_gameweek_id,
          seasonId: id(1),
          status: "finalized",
          lockVersion: 5,
          sequenceNumber: 1,
          scoringInputVersion: 1,
          deadlineAt: "2026-09-24T18:30:00Z",
          serverTime: now.toISOString(),
          unlockedLineups: 0,
          nextGameweekId: id(102),
          advancedToGameweekId: id(102),
        };
      throw new Error(`unexpected_rpc_${name}`);
    },
    async ingestPerformances() {
      const batch = batches[Math.min(batchIndex, batches.length - 1)]!;
      batchIndex += 1;
      return batch;
    },
  };
  return { gateway: g, calls };
}

describe("fantasy season orchestrator", () => {
  test("selects only gameweeks that have work, in sequence order", () => {
    const cal = calendar([
      {
        sequence: 1,
        status: "finalized",
        scoringInputVersion: 1,
        nextGameweekId: id(102),
        advancedToGameweekId: id(102),
      },
      { sequence: 2, status: "open", deadlineAt: "2026-09-24T18:30:00Z" },
      { sequence: 3, status: "scheduled" },
      { sequence: 4, status: "open", deadlineAt: "2026-10-08T18:30:00Z" },
    ]);
    expect(selectWorkerTargets(cal, now)).toEqual([
      { gameweekId: id(102), sequence: 2, reason: "deadline_passed", calculationVersion: 1 },
    ]);
  });

  test("a finalized gameweek with a staged, unopened successor is re-run for progression with its own version", () => {
    const cal = calendar([
      {
        sequence: 1,
        status: "finalized",
        scoringInputVersion: 3,
        nextGameweekId: id(102),
        advancedToGameweekId: null,
      },
      { sequence: 2, status: "scheduled" },
    ]);
    expect(selectWorkerTargets(cal, now)).toEqual([
      { gameweekId: id(101), sequence: 1, reason: "progression_pending", calculationVersion: 3 },
    ]);
  });

  test("in-progress gameweeks (locked/live/provisional/finalizing) are always picked up", () => {
    for (const status of ["locked", "live", "provisional", "finalizing"] as const) {
      const cal = calendar([{ sequence: 1, status, scoringInputVersion: 1 }]);
      expect(selectWorkerTargets(cal, now)[0]?.reason).toBe("in_progress");
    }
  });

  test("nothing due: two calendar syncs, one performance batch, no worker call", async () => {
    const cal = calendar([{ sequence: 1, status: "open", deadlineAt: "2026-09-25T18:30:00Z" }]);
    const { gateway: g, calls } = gateway(cal);
    const summary = await orchestrateFantasySeason(g, { now });
    expect(summary.verdict).toBe("ok");
    expect(summary.workers).toEqual([]);
    expect(calls.filter((c) => c.name === "service_sync_fantasy_calendar")).toHaveLength(2);
    expect(summary.performances).toEqual({ batches: 1, fixturesProcessed: 0 });
  });

  test("a worker that reports waiting leaves the pass in a waiting verdict and never fails it", async () => {
    const cal = calendar([{ sequence: 1, status: "open", deadlineAt: "2026-09-24T18:30:00Z" }]);
    const { gateway: g } = gateway(cal, {
      lifecycle: (name, args) => {
        if (name === "service_fantasy_lifecycle_state")
          return {
            schemaVersion: 1,
            gameweekId: args.p_gameweek_id,
            seasonId: id(1),
            status: "locked",
            lockVersion: 2,
            sequenceNumber: 1,
            scoringInputVersion: 0,
            deadlineAt: "2026-09-24T18:30:00Z",
            serverTime: now.toISOString(),
            unlockedLineups: 0,
            nextGameweekId: null,
            advancedToGameweekId: null,
          };
        if (name === "service_advance_fantasy_lifecycle")
          return {
            schemaVersion: 1,
            gameweekId: args.p_gameweek_id,
            seasonId: id(1),
            status: "locked",
            lockVersion: 2,
            sequenceNumber: 1,
            scoringInputVersion: 0,
            changed: false,
            lockedLineups: 0,
            hasMore: false,
            waitingReason: "football_not_started",
          };
        throw new Error(`unexpected_rpc_${name}`);
      },
    });
    const summary = await orchestrateFantasySeason(g, { now });
    expect(summary.verdict).toBe("waiting");
    expect(summary.workers[0]).toMatchObject({
      reason: "deadline_passed",
      calculationVersion: 1,
      outcome: "waiting",
      code: "football_not_started",
    });
  });

  test("a failing worker stops the pass with a stable code and does not run later gameweeks", async () => {
    const cal = calendar([
      { sequence: 1, status: "provisional", scoringInputVersion: 1 },
      { sequence: 2, status: "provisional", scoringInputVersion: 1 },
    ]);
    const { gateway: g } = gateway(cal, {
      lifecycle: () => {
        throw new Error("fantasy_scoring_coverage_incomplete");
      },
    });
    const summary = await orchestrateFantasySeason(g, { now });
    expect(summary.verdict).toBe("failed");
    expect(summary.workers).toHaveLength(1);
    expect(summary.workers[0]).toMatchObject({
      outcome: "failed",
      code: "fantasy_scoring_coverage_incomplete",
    });
  });

  test("performance ingestion follows the cursor and a provider failure only degrades to waiting", async () => {
    const cal = calendar([{ sequence: 1, status: "scheduled" }]);
    const { gateway: g } = gateway(cal, {
      batches: [
        { fixturesProcessed: 5, hasMore: true, nextCursor: "19874710" },
        { fixturesProcessed: 3, hasMore: false, nextCursor: null },
      ],
    });
    const summary = await orchestrateFantasySeason(g, { now });
    expect(summary.performances).toEqual({ batches: 2, fixturesProcessed: 8 });

    const failing = gateway(cal);
    failing.gateway.ingestPerformances = async () => {
      throw new Error("current_statistics_incomplete");
    };
    const degraded = await orchestrateFantasySeason(failing.gateway, { now });
    expect(degraded.verdict).toBe("waiting");
    expect(degraded.performances.error).toBe("current_statistics_incomplete");
  });

  test("provider refresh evidence: a squad-guard failure after the fixture phase still counts as refreshed", async () => {
    expect(
      summarizeProviderRefresh({
        verdict: "fail",
        errorCode: "current_squad_empty_or_oversized",
        fixtures: [{ from: "2026-09-24", to: "2026-09-24" }],
      }),
    ).toEqual({
      verdict: "fail",
      errorCode: "current_squad_empty_or_oversized",
      fixturesRefreshed: true,
      fixtureWindows: 1,
    });
    expect(summarizeProviderRefresh(null)).toEqual({
      verdict: "missing",
      fixturesRefreshed: false,
      fixtureWindows: 0,
    });
    expect(summarizeProviderRefresh({ verdict: "fail", errorCode: "<script>" })).toEqual({
      verdict: "fail",
      errorCode: "current_season_recovery_failed",
      fixturesRefreshed: false,
      fixtureWindows: 0,
    });

    const cal = calendar([{ sequence: 1, status: "open", deadlineAt: "2026-09-25T18:30:00Z" }]);
    const refreshed = await orchestrateFantasySeason(gateway(cal).gateway, {
      now,
      providerRefresh: summarizeProviderRefresh({ verdict: "pass", fixtures: [{}] }),
    });
    expect(refreshed.verdict).toBe("ok");
    const stale = await orchestrateFantasySeason(gateway(cal).gateway, {
      now,
      providerRefresh: summarizeProviderRefresh({ verdict: "fail", errorCode: "provider_down" }),
    });
    expect(stale.verdict).toBe("waiting");
    expect(stale.providerRefresh?.errorCode).toBe("provider_down");
  });

  test("an unexpected calendar payload fails closed", async () => {
    const g: OrchestratorGateway = {
      async rpc() {
        return { schemaVersion: 2 };
      },
      async ingestPerformances() {
        return { fixturesProcessed: 0, hasMore: false, nextCursor: null };
      },
    };
    await expect(orchestrateFantasySeason(g, { now })).rejects.toThrow();
  });

  test("environment guard requires explicit automation enablement, main, exact commit and production target", () => {
    const base = {
      FANTASY_AUTOMATION_ENABLED: "true",
      GITHUB_REPOSITORY: "mrdata007/botolago-foundation",
      GITHUB_REF: "refs/heads/main",
      GITHUB_EVENT_NAME: "schedule",
      GITHUB_RUN_ATTEMPT: "1",
      EXPECTED_COMMIT: "a".repeat(40),
      GITHUB_SHA: "a".repeat(40),
      SUPABASE_PRODUCTION_PROJECT_REF: "tkewgajrljbwgwedqsxn",
      SUPABASE_PRODUCTION_PROJECT_NAME: "BotolaGO Production V2",
      SUPABASE_PRODUCTION_URL: "https://tkewgajrljbwgwedqsxn.supabase.co/",
      SUPABASE_SECRET_KEY: "secret",
      SPORTSMONKS_API_TOKEN: "token",
      FANTASY_ORCHESTRATOR_EVIDENCE_DIR: "/tmp/evidence",
    };
    expect(orchestratorEnvironment(base).url).toBe("https://tkewgajrljbwgwedqsxn.supabase.co");
    expect(() => orchestratorEnvironment({ ...base, FANTASY_AUTOMATION_ENABLED: "false" })).toThrow(
      "fantasy_automation_disabled",
    );
    expect(() => orchestratorEnvironment({ ...base, GITHUB_EVENT_NAME: "push" })).toThrow(
      "fantasy_orchestrator_environment_mismatch",
    );
    expect(() =>
      orchestratorEnvironment({
        ...base,
        GITHUB_EVENT_NAME: "workflow_dispatch",
        GITHUB_ACTOR: "someone",
        FANTASY_ORCHESTRATOR_CONFIRMATION: "RUN_FANTASY_ORCHESTRATOR",
      }),
    ).toThrow("fantasy_orchestrator_environment_mismatch");
    expect(() =>
      orchestratorEnvironment({
        ...base,
        GITHUB_EVENT_NAME: "workflow_dispatch",
        GITHUB_ACTOR: "mrdata007",
      }),
    ).toThrow("fantasy_orchestrator_environment_mismatch");
    // An owner dispatch with the typed confirmation runs before the schedule is enabled.
    expect(
      orchestratorEnvironment({
        ...base,
        FANTASY_AUTOMATION_ENABLED: undefined,
        GITHUB_EVENT_NAME: "workflow_dispatch",
        GITHUB_ACTOR: "mrdata007",
        FANTASY_ORCHESTRATOR_CONFIRMATION: "RUN_FANTASY_ORCHESTRATOR",
      }).commit,
    ).toBe("a".repeat(40));
    expect(() => orchestratorEnvironment({ ...base, GITHUB_REF: "refs/heads/feature" })).toThrow();
    expect(() => orchestratorEnvironment({ ...base, EXPECTED_COMMIT: "b".repeat(40) })).toThrow();
    expect(() => orchestratorEnvironment({ ...base, GITHUB_RUN_ATTEMPT: "2" })).toThrow();
    expect(() => orchestratorEnvironment({ ...base, SUPABASE_SECRET_KEY: "" })).toThrow(
      "fantasy_orchestrator_credential_missing",
    );
  });
});
