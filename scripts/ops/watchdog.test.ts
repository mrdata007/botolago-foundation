import { describe, expect, test } from "bun:test";

import {
  databaseHealth,
  orchestratorRecency,
  overall,
  publicSurface,
  releaseDrift,
  renderTable,
  REQUIRED_DATABASE_CHECKS,
  type Check,
} from "./watchdog";

const url = "https://tkewgajrljbwgwedqsxn.supabase.co";

/** Every check the database always reports, all healthy, then `changes` on top. */
function healthyChecks(...changes: Check[]): Check[] {
  return REQUIRED_DATABASE_CHECKS.map(
    (name) =>
      changes.find((check) => check.name === name) ?? { name, status: "ok", detail: "fine" },
  );
}

describe("production watchdog", () => {
  test("reports each database check as the database states it", async () => {
    const reported = healthyChecks(
      {
        name: "fantasy_gameweek_lock",
        status: "fail",
        detail: "GW1 deadline passed 390 min ago, still open",
      },
      { name: "cron_jobs", status: "ok", detail: "no failed run in the last hour" },
    );
    const checks = await databaseHealth(
      async () => Response.json({ status: "fail", checks: reported }),
      url,
      "secret",
    );
    expect(checks).toEqual(reported);
  });

  test("a partial check list or a verdict that disagrees with its checks fails", async () => {
    // Valid JSON, valid entries, but the core checks are gone.
    const partial = await databaseHealth(
      async () =>
        Response.json({
          status: "fail",
          checks: [{ name: "cron_jobs", status: "ok", detail: "ok" }],
        }),
      url,
      "secret",
    );
    expect(overall(partial)).toBe("fail");
    expect(partial.at(-1)).toMatchObject({ name: "database_health", status: "fail" });
    expect(partial.at(-1)?.detail).toContain("fantasy_gameweek_lock");

    // Every check present and green, but the database itself says "fail".
    const disagreeing = await databaseHealth(
      async () => Response.json({ status: "fail", checks: healthyChecks() }),
      url,
      "secret",
    );
    expect(overall(disagreeing)).toBe("fail");
    expect(disagreeing.at(-1)?.detail).toContain("disagrees");

    // A missing top-level verdict is a malformed report.
    const noVerdict = await databaseHealth(
      async () => Response.json({ checks: healthyChecks() }),
      url,
      "secret",
    );
    expect(overall(noVerdict)).toBe("fail");

    // The complete healthy report stays green; the optional deadline watch may be added.
    const healthy = await databaseHealth(
      async () =>
        Response.json({
          status: "ok",
          checks: [
            ...healthyChecks(),
            { name: "fantasy_deadline_watch", status: "ok", detail: "no deadline at risk" },
          ],
        }),
      url,
      "secret",
    );
    expect(overall(healthy)).toBe("ok");
    expect(healthy).toHaveLength(REQUIRED_DATABASE_CHECKS.length + 1);
  });

  test("malformed health responses fail closed without leaking response bodies", async () => {
    for (const body of [
      "upstream secret",
      "null",
      "{}",
      '{"checks":[]}',
      '{"checks":{}}',
      '{"checks":[{"name":"bad name!","status":"ok","detail":"secret"}]}',
      '{"checks":[{"name":"cron_jobs","status":"ok"}]}',
    ]) {
      const checks = await databaseHealth(async () => new Response(body), url, "secret");
      expect(overall(checks)).toBe("fail");
      expect(JSON.stringify(checks)).not.toContain("secret");
    }
    expect(overall([])).toBe("fail");
  });

  test("malformed run history cannot hide a stopped orchestrator", async () => {
    for (const body of [
      "not json",
      "null",
      "{}",
      '{"workflow_runs":{}}',
      '{"workflow_runs":[{"created_at":"invalid"}]}',
    ]) {
      const check = await orchestratorRecency(
        async () => new Response(body),
        "owner/repo",
        "token",
        new Date(),
      );
      expect(check.status).toBe("fail");
    }
  });

  test("a database without the health migration is a warning, an unreachable one a failure", async () => {
    expect(
      await databaseHealth(
        async () => new Response('{"code":"PGRST202"}', { status: 404 }),
        url,
        "secret",
      ),
    ).toEqual([
      {
        name: "database_health",
        status: "warn",
        detail: "api.service_ops_health is not installed yet (migration 20260924200200)",
      },
    ]);
    const down = await databaseHealth(
      async () => new Response("upstream", { status: 503 }),
      url,
      "secret",
    );
    expect(down[0]).toMatchObject({ name: "database_health", status: "fail" });
  });

  test("the 2026-09-24 outage shape: pages answering 500 fail the watchdog", async () => {
    const checks = await publicSurface(
      async (target) =>
        target.endsWith("/news")
          ? new Response("error", { status: 500 })
          : new Response("<html></html>", { status: 200 }),
      "https://botolago.com",
      url,
      "publishable",
    );
    expect(checks.find((c) => c.name === "page_news")).toMatchObject({ status: "fail" });
    expect(checks.find((c) => c.name === "page_home")).toMatchObject({ status: "ok" });
    expect(checks.find((c) => c.name === "public_api")).toMatchObject({ status: "ok" });
    expect(overall(checks)).toBe("fail");
  });

  test("an orchestrator GitHub has not started for hours is a failure", async () => {
    const now = new Date("2026-09-24T20:00:00Z");
    const stale = await orchestratorRecency(
      async () =>
        Response.json({
          workflow_runs: [
            { created_at: "2026-09-24T09:57:06Z", status: "completed", conclusion: "failure" },
          ],
        }),
      "mrdata007/botolago-foundation",
      "token",
      now,
    );
    expect(stale).toEqual({
      name: "season_orchestrator",
      status: "fail",
      detail: "no run for 10 h (scheduled hourly)",
    });
    const recentButRed = await orchestratorRecency(
      async () =>
        Response.json({
          workflow_runs: [
            { created_at: "2026-09-24T19:00:00Z", status: "completed", conclusion: "failure" },
          ],
        }),
      "mrdata007/botolago-foundation",
      "token",
      now,
    );
    expect(recentButRed.status).toBe("warn");
  });

  test("a live site behind main is a warning after a day and a failure after three", async () => {
    const now = new Date("2026-09-27T12:00:00Z");
    const drift = (header: string | null, compare: Response) =>
      releaseDrift(
        async (target) =>
          target.startsWith("https://botolago.com")
            ? new Response("<html></html>", {
                headers: header ? { "x-botolago-release": header } : {},
              })
            : compare.clone(),
        "https://botolago.com",
        "mrdata007/botolago-foundation",
        "token",
        now,
      );
    const behind = (oldestCommit: string) =>
      Response.json({
        status: "ahead",
        ahead_by: 4,
        behind_by: 0,
        commits: [{ commit: { committer: { date: oldestCommit } } }],
      });

    expect(
      await drift(
        "d257de7d9b8387ea",
        Response.json({ status: "identical", ahead_by: 0, behind_by: 0, commits: [] }),
      ),
    ).toEqual({
      name: "release_drift",
      status: "ok",
      detail: "live site runs main (d257de7)",
    });
    expect((await drift("d257de7d9b8387ea", behind("2026-09-27T06:00:00Z"))).status).toBe("ok");
    expect((await drift("d257de7d9b8387ea", behind("2026-09-26T06:00:00Z"))).status).toBe("warn");
    const stale = await drift("d257de7d9b8387ea", behind("2026-09-21T09:00:00Z"));
    expect(stale.status).toBe("fail");
    expect(stale.detail).toContain("main is 4 commit(s) ahead of the live site (d257de7)");
    expect(stale.detail).toContain("docs/operations/DEPLOYMENT.md");
    expect((await drift(null, behind("2026-09-21T09:00:00Z"))).status).toBe("warn");
    expect((await drift("d257de7d9b8387ea", new Response("{}", { status: 404 }))).detail).toContain(
      "not a commit on GitHub",
    );

    // PR #199 review: a live release ahead of main (published from outside
    // main) also compares with ahead_by 0; it is not "runs main".
    const liveAhead = await drift(
      "d257de7d9b8387ea",
      Response.json({ status: "behind", ahead_by: 0, behind_by: 2, commits: [] }),
    );
    expect(liveAhead.status).toBe("warn");
    expect(liveAhead.detail).toContain("runs 2 commit(s) that main does not have");
    const divergedAndStale = await drift(
      "d257de7d9b8387ea",
      Response.json({
        status: "diverged",
        ahead_by: 3,
        behind_by: 1,
        commits: [{ commit: { committer: { date: "2026-09-21T09:00:00Z" } } }],
      }),
    );
    expect(divergedAndStale.status).toBe("fail");
    expect(divergedAndStale.detail).toContain("and main is 3 commit(s) ahead of it");
    const unreadable = await drift("d257de7d9b8387ea", Response.json({ ahead_by: 0, commits: [] }));
    expect(unreadable.status).toBe("warn");
    expect(unreadable.detail).toContain("unreadable");
  });

  test("the run page table escapes the table separator", () => {
    const checks: Check[] = [{ name: "cron_jobs", status: "fail", detail: "a | b" }];
    expect(renderTable(checks, "fail", new Date("2026-09-24T20:00:00Z"))).toContain(
      "| cron_jobs | fail | a \\| b |",
    );
  });
});
