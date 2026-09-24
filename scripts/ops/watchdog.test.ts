import { describe, expect, test } from "bun:test";

import {
  databaseHealth,
  orchestratorRecency,
  overall,
  publicSurface,
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
        detail: "api.service_ops_health is not installed yet (migration 20260924190200)",
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

  test("the run page table escapes the table separator", () => {
    const checks: Check[] = [{ name: "cron_jobs", status: "fail", detail: "a | b" }];
    expect(renderTable(checks, "fail", new Date("2026-09-24T20:00:00Z"))).toContain(
      "| cron_jobs | fail | a \\| b |",
    );
  });
});
