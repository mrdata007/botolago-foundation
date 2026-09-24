import { describe, expect, test } from "bun:test";
import {
  calendarSyncSchema,
  deadlineWatchSchema,
  mergeVerdict,
  orchestrateFantasySeason,
  orchestratorEnvironment,
  selectWorkerTargets,
  shouldFailRun,
  summarizeDeadlineWatch,
  summarizeProviderRefresh,
  type CalendarSync,
  type DeadlineWatch,
  type OrchestratorGateway,
} from "./fantasy-season-orchestrator";
import { rpcFailure } from "./fantasy-lifecycle-runner";

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

const watchFixture = (n: number, kickoff = "2026-09-24T00:00:00+00:00") => ({
  fixtureId: id(200 + n),
  homeTeam: `H${n}`,
  awayTeam: `A${n}`,
  providerKickoffAt: kickoff,
  assignedKickoffAt: kickoff,
  originalKickoffAt: kickoff,
  fixtureStatus: "scheduled",
  assignmentStatus: "assigned",
  frozen: false,
  providerUpdatedAt: "2026-09-18T10:00:00+00:00",
  sourceSequence: 1,
});

/** Reference payload shaped exactly like api.service_fantasy_deadline_watch. */
function watchPayload(
  gameweeks: Array<{ sequence: number; severity: "info" | "escalate"; hoursToDeadline?: number }>,
  overrides: Record<string, unknown> = {},
) {
  return {
    schemaVersion: 1,
    seasonId: id(1),
    seasonStatus: "active",
    warnHours: 72,
    escalateHours: 24,
    serverTime: now.toISOString(),
    remediation: "docs/backend/FANTASY_SEASON_ORCHESTRATION_RUNBOOK.md",
    gameweeks: gameweeks.map((gw) => ({
      gameweekId: id(100 + gw.sequence),
      sequence: gw.sequence,
      status: "open",
      deadlineAt: "2026-09-23T22:30:00+00:00",
      startsAt: "2026-09-24T00:00:00+00:00",
      hoursToDeadline: gw.hoursToDeadline ?? (gw.severity === "escalate" ? 4.5 : 60.25),
      deadlinePassed: false,
      unconfirmedFixtures: 1,
      totalCountingFixtures: 8,
      deadlineDerivedFromPlaceholder: true,
      severity: gw.severity,
      fixtures: [watchFixture(gw.sequence)],
    })),
    ...overrides,
  };
}

/** A gateway whose lifecycle RPCs answer like a finalized, already advanced gameweek. */
function gateway(
  cal: CalendarSync,
  options: {
    lifecycle?: (name: string, args: Record<string, unknown>) => unknown;
    batches?: Array<{ fixturesProcessed: number; hasMore: boolean; nextCursor: string | null }>;
    watch?: unknown;
    prizes?: unknown;
  } = {},
) {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const batches = options.batches ?? [{ fixturesProcessed: 0, hasMore: false, nextCursor: null }];
  let batchIndex = 0;
  const g: OrchestratorGateway = {
    async rpc(name, args) {
      calls.push({ name, args });
      if (name === "service_sync_fantasy_calendar") return cal;
      if (name === "service_fantasy_deadline_watch") {
        const watch = options.watch ?? watchPayload([]);
        if (watch instanceof Error) throw watch;
        return watch;
      }
      if (name === "service_evaluate_fantasy_prizes") {
        const prizes = options.prizes ?? {
          evaluatedCount: 0,
          evaluated: [],
          blocked: [],
          hasMore: false,
        };
        if (prizes instanceof Error) throw prizes;
        return prizes;
      }
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
    expect(selectWorkerTargets(cal, now)).toEqual({
      targets: [
        { gameweekId: id(102), sequence: 2, reason: "deadline_passed", calculationVersion: 1 },
      ],
      skipped: [],
    });
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
    expect(selectWorkerTargets(cal, now)).toEqual({
      targets: [
        { gameweekId: id(101), sequence: 1, reason: "progression_pending", calculationVersion: 3 },
      ],
      skipped: [],
    });
  });

  test("in-progress gameweeks (locked/live/provisional/finalizing) are always picked up", () => {
    for (const status of ["locked", "live", "provisional", "finalizing"] as const) {
      const cal = calendar([{ sequence: 1, status, scoringInputVersion: 1 }]);
      expect(selectWorkerTargets(cal, now).targets[0]?.reason).toBe("in_progress");
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

  test("every pass runs the prize catch-up once and reports it by status", async () => {
    const cal = calendar([{ sequence: 1, status: "open", deadlineAt: "2026-09-25T18:30:00Z" }]);
    const { gateway: g, calls } = gateway(cal, {
      prizes: {
        evaluatedCount: 1,
        evaluated: [
          {
            seasonId: id(1),
            gameweekId: id(101),
            gameweekNumber: 30,
            outcome: {
              gameweek: { status: "awarded", winnerId: id(7) },
              season: { status: "awarded" },
            },
          },
        ],
        blocked: [],
        hasMore: false,
      },
    });
    const summary = await orchestrateFantasySeason(g, { now });
    expect(summary.verdict).toBe("ok");
    expect(calls.filter((c) => c.name === "service_evaluate_fantasy_prizes")).toHaveLength(1);
    expect(summary.prizes).toEqual({
      evaluatedCount: 1,
      hasMore: false,
      blocked: [],
      gameweeks: [{ gameweekNumber: 30, tiers: { gameweek: "awarded", season: "awarded" } }],
    });
  });

  test("a prize failure or a blocked season degrades to waiting and never fails the pass", async () => {
    const cal = calendar([{ sequence: 1, status: "open", deadlineAt: "2026-09-25T18:30:00Z" }]);
    const failing = await orchestrateFantasySeason(
      gateway(cal, { prizes: new Error("fantasy_orchestrator_rpc_failed") }).gateway,
      { now },
    );
    expect(failing.verdict).toBe("waiting");
    expect(shouldFailRun(failing.verdict)).toBe(false);
    expect(failing.prizes).toEqual({ error: "fantasy_orchestrator_rpc_failed" });

    const blocked = await orchestrateFantasySeason(
      gateway(cal, {
        prizes: {
          evaluatedCount: 0,
          evaluated: [],
          blocked: [{ seasonId: id(1), reason: "season_gameweek_count_too_small" }],
          hasMore: false,
        },
      }).gateway,
      { now },
    );
    expect(blocked.verdict).toBe("waiting");
    expect(blocked.prizes).toMatchObject({ blocked: ["season_gameweek_count_too_small"] });
  });

  test("before the prize migration is promoted, the pass says so and keeps its verdict", async () => {
    const cal = calendar([{ sequence: 1, status: "open", deadlineAt: "2026-09-25T18:30:00Z" }]);
    const summary = await orchestrateFantasySeason(
      gateway(cal, { prizes: rpcFailure("fantasy_orchestrator_rpc_failed", "PGRST202") }).gateway,
      { now },
    );
    expect(summary.verdict).toBe("ok");
    expect(summary.prizes).toEqual({ skipped: "prizes_not_installed" });
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

describe("fantasy deadline watch", () => {
  const roundNote = (gameweekId: string, notes: unknown[]) => ({
    round: 1,
    gameweekId,
    status: "open" as const,
    fixtures: 8,
    confirmedKickoffs: 0,
    notes,
  });

  test("the payload schema accepts the reference shape and rejects anything else", () => {
    const reference = watchPayload([{ sequence: 1, severity: "escalate" }]);
    expect(deadlineWatchSchema.parse(reference).gameweeks[0]?.fixtures).toHaveLength(1);
    expect(() => deadlineWatchSchema.parse({ ...reference, schemaVersion: 2 })).toThrow();
    expect(() =>
      deadlineWatchSchema.parse(
        watchPayload([{ sequence: 1, severity: "critical" as unknown as "info" }]),
      ),
    ).toThrow();
    const badId = watchPayload([{ sequence: 1, severity: "info" }]);
    badId.gameweeks[0]!.gameweekId = "not-a-uuid";
    expect(() => deadlineWatchSchema.parse(badId)).toThrow();
  });

  test("summarizeDeadlineWatch partitions by severity, sorts by sequence and is clock-free", () => {
    const watch = deadlineWatchSchema.parse(
      watchPayload([
        { sequence: 3, severity: "escalate" },
        { sequence: 2, severity: "info" },
      ]),
    ) as DeadlineWatch;
    const summary = summarizeDeadlineWatch(watch);
    expect(summary.affected).toBe(2);
    expect(summary.escalations.map((gw) => gw.sequence)).toEqual([3]);
    expect(summary.informational.map((gw) => gw.sequence)).toEqual([2]);
    expect(summary.remediation).toBe("docs/backend/FANTASY_SEASON_ORCHESTRATION_RUNBOOK.md");
    expect(summarizeDeadlineWatch(watch)).toEqual(summary);
  });

  test("mergeVerdict ranks ok < waiting < escalate < failed", () => {
    expect(mergeVerdict("ok", "escalate")).toBe("escalate");
    expect(mergeVerdict("waiting", "escalate")).toBe("escalate");
    expect(mergeVerdict("escalate", "waiting")).toBe("escalate");
    expect(mergeVerdict("failed", "escalate")).toBe("failed");
    expect(mergeVerdict("escalate", "failed")).toBe("failed");
    expect(mergeVerdict("ok", "ok")).toBe("ok");
  });

  test("shouldFailRun turns the workflow step red only for failed and escalate", () => {
    expect(shouldFailRun("failed")).toBe(true);
    expect(shouldFailRun("escalate")).toBe(true);
    expect(shouldFailRun("waiting")).toBe(false);
    expect(shouldFailRun("ok")).toBe(false);
  });

  test("an escalating watch turns the pass red without changing what the pass did", async () => {
    const cal = calendar([{ sequence: 1, status: "open", deadlineAt: "2026-09-25T18:30:00Z" }]);
    const { gateway: g, calls } = gateway(cal, {
      watch: watchPayload([{ sequence: 1, severity: "escalate" }]),
    });
    const summary = await orchestrateFantasySeason(g, { now });
    expect(summary.verdict).toBe("escalate");
    expect(summary.workers).toEqual([]);
    expect(summary.performances).toEqual({ batches: 1, fixturesProcessed: 0 });
    expect(calls.filter((c) => c.name === "service_sync_fantasy_calendar")).toHaveLength(2);
    expect(summary.deadlineWatch).toMatchObject({
      warnHours: 72,
      escalateHours: 24,
      affected: 1,
      remediation: "docs/backend/FANTASY_SEASON_ORCHESTRATION_RUNBOOK.md",
    });
  });

  test("an informational-only watch leaves the verdict ok and still reports the gameweek", async () => {
    const cal = calendar([{ sequence: 1, status: "open", deadlineAt: "2026-09-25T18:30:00Z" }]);
    const { gateway: g } = gateway(cal, {
      watch: watchPayload([{ sequence: 1, severity: "info" }]),
    });
    const summary = await orchestrateFantasySeason(g, { now });
    expect(summary.verdict).toBe("ok");
    const watch = summary.deadlineWatch as { affected: number; informational: unknown[] };
    expect(watch.affected).toBe(1);
    expect(watch.informational).toHaveLength(1);
  });

  test("a worker failure outranks an escalation and the watch is still reported", async () => {
    const cal = calendar([{ sequence: 1, status: "provisional", scoringInputVersion: 1 }]);
    const { gateway: g } = gateway(cal, {
      watch: watchPayload([{ sequence: 1, severity: "escalate" }]),
      lifecycle: () => {
        throw new Error("fantasy_scoring_coverage_incomplete");
      },
    });
    const summary = await orchestrateFantasySeason(g, { now });
    expect(summary.verdict).toBe("failed");
    expect(summary.deadlineWatch).toMatchObject({ affected: 1 });
  });

  test("a watch failure or an unexpected payload degrades to waiting instead of throwing", async () => {
    const cal = calendar([{ sequence: 1, status: "open", deadlineAt: "2026-09-25T18:30:00Z" }]);
    const failing = await orchestrateFantasySeason(
      gateway(cal, { watch: new Error("connection reset") }).gateway,
      { now },
    );
    expect(failing.verdict).toBe("waiting");
    expect(failing.deadlineWatch).toEqual({ error: "fantasy_deadline_watch_failed" });

    const unexpected = await orchestrateFantasySeason(
      gateway(cal, { watch: { schemaVersion: 2 } }).gateway,
      { now },
    );
    expect(unexpected.verdict).toBe("waiting");
    expect(unexpected.deadlineWatch).toEqual({ error: "fantasy_deadline_watch_failed" });
  });

  test("two passes over the same state serialise identically and carry no secret-shaped field", async () => {
    const cal = calendar([{ sequence: 1, status: "open", deadlineAt: "2026-09-25T18:30:00Z" }]);
    const watch = watchPayload([{ sequence: 1, severity: "escalate" }]);
    const first = await orchestrateFantasySeason(gateway(cal, { watch }).gateway, { now });
    const second = await orchestrateFantasySeason(gateway(cal, { watch }).gateway, { now });
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(JSON.stringify(first)).not.toMatch(
      /(?:access_token|refresh_token|token_hash|hashed_token|password)/i,
    );
  });

  test("the window is passed to the RPC, with the documented defaults", async () => {
    const cal = calendar([{ sequence: 1, status: "open", deadlineAt: "2026-09-25T18:30:00Z" }]);
    const defaults = gateway(cal);
    await orchestrateFantasySeason(defaults.gateway, { now });
    expect(defaults.calls.find((c) => c.name === "service_fantasy_deadline_watch")?.args).toEqual({
      p_fantasy_season_id: null,
      p_warn_hours: 72,
      p_escalate_hours: 24,
    });

    const overridden = gateway(cal);
    await orchestrateFantasySeason(overridden.gateway, {
      now,
      deadlineWatch: { warnHours: 120, escalateHours: 6 },
    });
    expect(overridden.calls.find((c) => c.name === "service_fantasy_deadline_watch")?.args).toEqual(
      {
        p_fantasy_season_id: null,
        p_warn_hours: 120,
        p_escalate_hours: 6,
      },
    );
  });

  test("the environment guard validates the watch window", () => {
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
    expect(orchestratorEnvironment(base).deadlineWatch).toEqual({
      warnHours: 72,
      escalateHours: 24,
    });
    expect(
      orchestratorEnvironment({
        ...base,
        FANTASY_DEADLINE_WATCH_WARN_HOURS: "120",
        FANTASY_DEADLINE_WATCH_ESCALATE_HOURS: "6",
      }).deadlineWatch,
    ).toEqual({ warnHours: 120, escalateHours: 6 });
    for (const override of [
      { FANTASY_DEADLINE_WATCH_WARN_HOURS: "abc" },
      { FANTASY_DEADLINE_WATCH_WARN_HOURS: "721" },
      { FANTASY_DEADLINE_WATCH_WARN_HOURS: "12", FANTASY_DEADLINE_WATCH_ESCALATE_HOURS: "24" },
    ]) {
      expect(() => orchestratorEnvironment({ ...base, ...override })).toThrow(
        "fantasy_deadline_watch_window_invalid",
      );
    }
  });

  test("an open gameweek with an unconfirmed deadline is never locked by the pass", () => {
    const cal = calendar(
      [
        { sequence: 1, status: "open", deadlineAt: "2026-09-23T22:30:00Z" },
        { sequence: 2, status: "open", deadlineAt: "2026-09-24T18:30:00Z" },
      ],
      {
        rounds: [
          roundNote(id(101), [{ kickoffUnconfirmed: 8, deadlineUnconfirmed: true }]),
          roundNote(id(102), [{ kickoffUnconfirmed: 0, deadlineUnconfirmed: false }]),
        ],
      },
    );
    expect(selectWorkerTargets(cal, now)).toEqual({
      targets: [
        { gameweekId: id(102), sequence: 2, reason: "deadline_passed", calculationVersion: 1 },
      ],
      skipped: [{ gameweekId: id(101), sequence: 1, reason: "deadline_unconfirmed" }],
    });
  });

  test("the string note from the calendar sync refuses the target too, and degrades the verdict", async () => {
    const cal = calendar([{ sequence: 1, status: "open", deadlineAt: "2026-09-23T22:30:00Z" }], {
      rounds: [roundNote(id(101), ["deadline_unconfirmed"])],
    });
    const { gateway: g, calls } = gateway(cal);
    const summary = await orchestrateFantasySeason(g, { now });
    expect(summary.verdict).toBe("waiting");
    expect(summary.workers).toEqual([]);
    expect(summary.skipped).toEqual([
      { gameweekId: id(101), sequence: 1, reason: "deadline_unconfirmed" },
    ]);
    expect(calls.some((c) => c.name === "service_fantasy_lifecycle_state")).toBe(false);
  });
});
