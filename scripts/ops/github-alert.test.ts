import { describe, expect, test } from "bun:test";

import {
  ALERT_LABEL,
  categorize,
  failureReport,
  GitHubIssues,
  issueTitle,
  reportRun,
  type RunContext,
} from "./github-alert";

const ctx: RunContext = {
  repository: "mrdata007/botolago-foundation",
  workflow: "Fantasy season orchestrator",
  runId: "36017188883",
  runAttempt: "1",
  serverUrl: "https://github.com",
  sha: "2d97354a9d891da30fb4941e8ad2812c4d07166f",
  refName: "main",
  event: "schedule",
  now: new Date("2026-09-24T15:03:26.000Z"),
};

// The evidence run #37 actually wrote on 2026-09-24 (trimmed).
const run37 = {
  verdict: "failed",
  providerRefresh: { verdict: "fail", errorCode: "current_squad_empty_or_oversized" },
  workers: [
    {
      gameweekId: "7fcb28c5-9b69-4591-bcda-437c6c961c5c",
      sequence: 1,
      reason: "deadline_passed",
      outcome: "failed",
      code: "fantasy_fixture_resolution_required",
    },
  ],
  deadlineWatch: { escalations: [] },
};

describe("alert content", () => {
  test("names the real error category from the run's evidence", () => {
    expect(categorize(run37)).toEqual({
      category: "fantasy_lifecycle_refused",
      detail: "verdict failed; lifecycle GW1: fantasy_fixture_resolution_required",
    });
    expect(
      categorize({ verdict: "failed", code: "fantasy_orchestrator_rpc_failed" }).category,
    ).toBe("fantasy_orchestrator_rpc_failed");
    expect(categorize(null)).toEqual({
      category: "workflow_failed",
      detail: "no evidence file; see the run log",
    });
  });

  test("names finished fixtures still without statistics past the orchestrator's threshold", () => {
    const category = categorize({
      verdict: "escalate",
      performances: {
        batches: 1,
        fixturesProcessed: 0,
        coverageEscalateHours: 6,
        incomplete: [
          {
            fixtureExternalId: "19874708",
            code: "invalid_provider_id",
            diagnostic: { field: "data.lineups[12].player_id", valueType: "null" },
            overdue: true,
          },
          { fixtureExternalId: "19874709", code: "provider_attempts_exhausted", overdue: false },
          { fixtureExternalId: "<b>", code: "invalid_provider_id", overdue: true },
        ],
      },
      deadlineWatch: { escalations: [] },
    });
    expect(category).toEqual({
      category: "performance_coverage_overdue",
      detail:
        "verdict escalate; 1 finished fixture(s) without statistics past the threshold: 19874708 invalid_provider_id",
    });
    expect(
      categorize({ verdict: "failed", performances: { error: "current_performance_rpc_failed" } }),
    ).toEqual({
      category: "current_performance_rpc_failed",
      detail: "verdict failed; performance listing current_performance_rpc_failed",
    });
  });

  test("names the gameweeks past their window without final points", () => {
    expect(
      categorize({
        verdict: "escalate",
        performances: { batches: 1, fixturesProcessed: 0 },
        scoring: {
          escalateHours: 6,
          gameweeks: [
            { sequence: 1, status: "live", overdue: true, workerCode: "football_not_final" },
            { sequence: 2, status: "live", overdue: false },
            { sequence: 3, status: "Live <b>", overdue: true, workerCode: "free text here" },
          ],
        },
      }),
    ).toEqual({
      category: "fantasy_points_overdue",
      detail:
        "verdict escalate; 2 gameweek(s) without final points past the threshold: GW1 live football_not_final, GW3",
    });
    expect(
      categorize({ verdict: "escalate", scoring: { error: "fantasy_orchestrator_rpc_failed" } }),
    ).toEqual({
      category: "fantasy_orchestrator_rpc_failed",
      detail: "verdict escalate; gameweek windows fantasy_orchestrator_rpc_failed",
    });
  });

  test("lists the watchdog's failing checks", () => {
    const category = categorize({
      verdict: "failed",
      code: "fantasy_gameweek_lock",
      failingChecks: [
        { name: "fantasy_gameweek_lock", detail: "GW1 deadline passed 390 min ago, still open" },
        { name: "live_scores", detail: "live refresh switched off with 1 match(es) in play" },
      ],
    });
    expect(category.category).toBe("fantasy_gameweek_lock");
    expect(category.detail).toContain(
      "failing: fantasy_gameweek_lock (GW1 deadline passed 390 min ago",
    );
  });

  test("never copies free text or unexpected fields out of the evidence", () => {
    const category = categorize({
      verdict: "failed",
      code: "Bearer eyJhbGciOiJIUzI1NiJ9.x.y",
      message: "password=hunter2",
      workers: [{ outcome: "failed", code: "<script>", sequence: 1 }],
    });
    expect(JSON.stringify(category)).not.toContain("eyJ");
    expect(JSON.stringify(category)).not.toContain("hunter2");
    expect(JSON.stringify(category)).not.toContain("<script>");
  });

  test("the first report carries everything an operator needs, and mentions the owner", () => {
    const body = failureReport(ctx, categorize(run37), true);
    for (const expected of [
      "@mrdata007",
      "| Environment | production (Supabase `tkewgajrljbwgwedqsxn`) |",
      "| Job | Fantasy season orchestrator |",
      "| Time | 2026-09-24T15:03:26Z |",
      "| Error category | `fantasy_lifecycle_refused` |",
      "(https://github.com/mrdata007/botolago-foundation/actions/runs/36017188883)",
      "docs/operations/ALERTS.md",
    ]) {
      expect({ expected, present: body.includes(expected) }).toEqual({ expected, present: true });
    }
    expect(failureReport(ctx, categorize(run37), false)).not.toContain("@mrdata007");
  });
});

describe("issue lifecycle", () => {
  function fakeIssues(openNumber: number | null) {
    const calls: string[] = [];
    return {
      calls,
      issues: {
        async findOpen(title: string) {
          calls.push(`find ${title}`);
          return openNumber;
        },
        async ensureLabel() {
          calls.push("label");
        },
        async create(title: string) {
          calls.push(`create ${title}`);
          return 42;
        },
        async comment(number: number) {
          calls.push(`comment #${number}`);
        },
        async close(number: number) {
          calls.push(`close #${number}`);
        },
      },
    };
  }

  test("a first failure opens one labelled issue", async () => {
    const { issues, calls } = fakeIssues(null);
    expect(await reportRun(issues, "failure", ctx, categorize(run37))).toBe("opened #42");
    expect(calls).toEqual([
      `find ${issueTitle(ctx.workflow)}`,
      "label",
      `create ${issueTitle(ctx.workflow)}`,
    ]);
  });

  test("a repeated failure comments on the open issue instead of opening another", async () => {
    const { issues, calls } = fakeIssues(7);
    expect(await reportRun(issues, "failure", ctx, categorize(run37))).toBe("commented #7");
    expect(calls).toEqual([`find ${issueTitle(ctx.workflow)}`, "comment #7"]);
  });

  test("the next success closes it, and a success with nothing open does nothing", async () => {
    const open = fakeIssues(7);
    expect(await reportRun(open.issues, "success", ctx, categorize(null))).toBe("closed #7");
    expect(open.calls).toEqual([`find ${issueTitle(ctx.workflow)}`, "comment #7", "close #7"]);
    const none = fakeIssues(null);
    expect(await reportRun(none.issues, "success", ctx, categorize(null))).toBe("nothing_open");
  });

  test("talks to the GitHub REST API with the label and the token", async () => {
    const requests: Array<{ url: string; method: string; body?: string; auth?: string }> = [];
    const client = new GitHubIssues(
      "mrdata007/botolago-foundation",
      "token-value",
      async (url, init) => {
        requests.push({
          url,
          method: init?.method ?? "GET",
          body: typeof init?.body === "string" ? init.body : undefined,
          auth: (init?.headers as Record<string, string>)?.Authorization,
        });
        if (url.endsWith(`/issues?state=open&labels=${ALERT_LABEL}&per_page=100`))
          return Response.json([{ number: 3, title: "[ops] other is failing" }]);
        if (url.endsWith("/issues")) return Response.json({ number: 9 });
        return Response.json({});
      },
    );
    expect(await client.findOpen(issueTitle(ctx.workflow))).toBeNull();
    expect(await client.create("t", "b")).toBe(9);
    expect(requests[1]).toMatchObject({
      url: "https://api.github.com/repos/mrdata007/botolago-foundation/issues",
      method: "POST",
      auth: "Bearer token-value",
    });
    expect(JSON.parse(requests[1].body!)).toEqual({ title: "t", body: "b", labels: [ALERT_LABEL] });
  });
});
