import { describe, expect, test } from "bun:test";

import {
  databaseHealth,
  orchestratorRecency,
  overall,
  publicSurface,
  releaseDrift,
  renderTable,
  type Check,
} from "./watchdog";

const url = "https://tkewgajrljbwgwedqsxn.supabase.co";

describe("production watchdog", () => {
  test("reports each database check as the database states it", async () => {
    const checks = await databaseHealth(
      async () =>
        Response.json({
          status: "fail",
          checks: [
            {
              name: "fantasy_gameweek_lock",
              status: "fail",
              detail: "GW1 deadline passed 390 min ago, still open",
            },
            { name: "cron_jobs", status: "ok", detail: "no failed run in the last hour" },
            { name: "bad name!", status: "fail", detail: "ignored: not one of our names" },
          ],
        }),
      url,
      "secret",
    );
    expect(checks).toEqual([
      {
        name: "fantasy_gameweek_lock",
        status: "fail",
        detail: "GW1 deadline passed 390 min ago, still open",
      },
      { name: "cron_jobs", status: "ok", detail: "no failed run in the last hour" },
    ]);
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
        ahead_by: 4,
        commits: [{ commit: { committer: { date: oldestCommit } } }],
      });

    expect(await drift("d257de7d9b8387ea", Response.json({ ahead_by: 0, commits: [] }))).toEqual({
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
  });

  test("the run page table escapes the table separator", () => {
    const checks: Check[] = [{ name: "cron_jobs", status: "fail", detail: "a | b" }];
    expect(renderTable(checks, "fail", new Date("2026-09-24T20:00:00Z"))).toContain(
      "| cron_jobs | fail | a \\| b |",
    );
  });
});
