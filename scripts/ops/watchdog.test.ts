import { describe, expect, test } from "bun:test";

import {
  databaseHealth,
  fantasyPoints,
  pointsEscalateHours,
  orchestratorRecency,
  overall,
  publicSurface,
  releaseDrift,
  renderTable,
  sitemapEntries,
  watchdogSchedule,
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

  test("any check the database adds is reported by its own name, and nothing it says is dropped", async () => {
    const health = (payload: unknown) =>
      databaseHealth(
        async () => (typeof payload === "string" ? new Response(payload) : Response.json(payload)),
        url,
        "secret",
      );
    // Checks from a later migration need no change here.
    expect(
      await health({
        status: "fail",
        checks: [
          {
            name: "fantasy_statistics_coverage",
            status: "fail",
            detail: "fixture 19874708 finished 9.7 h ago without statistics",
          },
          { name: "sitemap_snapshot", status: "warn", detail: "last refresh 3 h ago" },
        ],
      }),
    ).toEqual([
      {
        name: "fantasy_statistics_coverage",
        status: "fail",
        detail: "fixture 19874708 finished 9.7 h ago without statistics",
      },
      { name: "sitemap_snapshot", status: "warn", detail: "last refresh 3 h ago" },
    ]);
    // A status this script does not know fails instead of disappearing.
    expect(
      await health({
        checks: [{ name: "scoring_age", status: "critical", detail: "GW1 unscored" }],
      }),
    ).toEqual([
      {
        name: "scoring_age",
        status: "fail",
        detail: 'unrecognised status "critical": GW1 unscored',
      },
    ]);
    // An overall failure no named check explains still fails.
    const unexplained = await health({
      status: "fail",
      checks: [
        { name: "cron_jobs", status: "ok", detail: "no failed run in the last hour" },
        { name: "Bad Name", status: "fail", detail: "x" },
      ],
    });
    expect(unexplained.find((c) => c.name === "database_health")).toMatchObject({ status: "fail" });
    expect(overall(unexplained)).toBe("fail");
    // Blind is not healthy.
    expect(await health({ status: "ok", checks: [] })).toEqual([
      { name: "database_health", status: "fail", detail: "health RPC returned no checks" },
    ]);
    expect(await health("<html>gateway</html>")).toEqual([
      { name: "database_health", status: "fail", detail: "health RPC answered 200 without JSON" },
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

  // Audit 2026-09-25: /sitemap.xml answered 503 for hours. A 200 that carries
  // no sitemap would be the same outage behind a green status.
  test("the sitemap must answer 200 with entries in it", async () => {
    const sitemap = async (response: Response) =>
      (
        await publicSurface(
          async (target) =>
            target.endsWith("/sitemap.xml") ? response.clone() : new Response("<html></html>"),
          "https://botolago.com",
          url,
          undefined,
        )
      ).find((c) => c.name === "page_sitemapxml");
    const urlset =
      '<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://botolago.com/</loc></url><url><loc>https://botolago.com/news</loc></url></urlset>';
    expect(await sitemap(new Response(urlset))).toMatchObject({ status: "ok" });
    expect((await sitemap(new Response(urlset)))?.detail).toMatch(
      /^\/sitemap\.xml answered 200 in \d+ ms \(2 URLs\)$/,
    );
    expect(
      (
        await sitemap(
          new Response(
            "<sitemapindex><sitemap><loc>https://botolago.com/sitemap-news-1.xml</loc></sitemap></sitemapindex>",
          ),
        )
      )?.detail,
    ).toContain("(1 sitemaps)");
    expect(
      await sitemap(new Response("Sitemap temporarily unavailable", { status: 503 })),
    ).toMatchObject({ status: "fail" });
    expect(await sitemap(new Response("<urlset></urlset>"))).toMatchObject({ status: "fail" });
    expect(await sitemap(new Response("<html>soft error</html>"))).toMatchObject({
      status: "fail",
    });
    expect(sitemapEntries("<urlset>")).toEqual({ kind: "urlset", entries: 0 });
    expect(sitemapEntries("nothing")).toBeNull();
  });

  test("a watchdog schedule GitHub does not start is visible, as a warning", async () => {
    const now = new Date("2026-09-25T07:50:00Z");
    const schedule = (answer: Response) =>
      watchdogSchedule(async () => answer.clone(), "mrdata007/botolago-foundation", "token", now);
    expect(await schedule(Response.json({ total_count: 0, workflow_runs: [] }))).toMatchObject({
      name: "watchdog_schedule",
      status: "warn",
      detail: expect.stringContaining("never started this watchdog on its schedule"),
    });
    expect(
      await schedule(
        Response.json({
          workflow_runs: [
            { created_at: "2026-09-25T04:37:40Z", status: "completed", conclusion: "success" },
          ],
        }),
      ),
    ).toEqual({
      name: "watchdog_schedule",
      status: "warn",
      detail: "GitHub last started the 30-minute schedule 3.2 h ago",
    });
    expect(
      (
        await schedule(
          Response.json({
            workflow_runs: [
              { created_at: "2026-09-25T07:37:40Z", status: "completed", conclusion: "success" },
            ],
          }),
        )
      ).status,
    ).toBe("ok");
    expect((await schedule(new Response("{}", { status: 502 }))).status).toBe("warn");
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
    // A red run is the orchestrator escalating (statistics or points
    // overdue, a failed refresh or worker): it pages from here too, so the
    // page does not rest on that run's own alert step. It used to warn.
    expect(recentButRed).toEqual({
      name: "season_orchestrator",
      status: "fail",
      detail: "last run 1 h ago, last completed: failure (its run summary names what escalated)",
    });
    const finished = (conclusion: string) =>
      orchestratorRecency(
        async () =>
          Response.json({
            workflow_runs: [
              { created_at: "2026-09-24T19:30:00Z", status: "in_progress", conclusion: null },
              { created_at: "2026-09-24T19:00:00Z", status: "completed", conclusion },
            ],
          }),
        "mrdata007/botolago-foundation",
        "token",
        now,
      );
    expect((await finished("timed_out")).status).toBe("fail");
    expect((await finished("cancelled")).status).toBe("warn");
    expect((await finished("success")).status).toBe("ok");
  });

  test("a gameweek whose window ended without final points fails, from the database alone", async () => {
    const season = "00000000-0000-4000-8000-000000000001";
    const now = new Date("2026-09-28T10:30:00Z");
    const database =
      (gameweeks: unknown, hub: Response = Response.json({ season: { id: season } })) =>
      async (target: string, init?: RequestInit) => {
        expect(target.startsWith(`${url}/rest/v1/rpc/`)).toBe(true);
        if (target.endsWith("/fantasy_hub")) return hub.clone();
        expect(JSON.parse(String(init?.body))).toEqual({
          p_season_id: season,
          p_before_sequence: null,
          p_limit: 100,
        });
        return gameweeks instanceof Response ? gameweeks.clone() : Response.json(gameweeks);
      };
    const windows = (gw1: string, gw1End = "2026-09-28T00:00:00+00:00") => ({
      items: [
        { id: "b", sequence: 2, status: "scheduled", endsAt: "2026-10-04T02:00:00+00:00" },
        { id: "a", sequence: 1, status: gw1, endsAt: gw1End },
      ],
      nextCursor: null,
    });
    expect(await fantasyPoints(database(windows("live")), url, "secret", now)).toEqual({
      name: "fantasy_points",
      status: "fail",
      detail:
        "GW1 live 10.5 h after its window: past 6 h without final points (docs/backend/FANTASY_SEASON_ORCHESTRATION_RUNBOOK.md)",
    });
    // Inside the allowance it is visible but does not page.
    expect(
      await fantasyPoints(database(windows("provisional")), url, "secret", now, 12),
    ).toMatchObject({ status: "warn", detail: expect.stringContaining("escalates at 12 h") });
    expect((await fantasyPoints(database(windows("finalized")), url, "secret", now)).status).toBe(
      "ok",
    );
    // Before the window ends there is nothing to owe.
    expect(
      (
        await fantasyPoints(
          database(windows("live", "2026-09-28T12:00:00+00:00")),
          url,
          "secret",
          now,
        )
      ).status,
    ).toBe("ok");
    // An end that cannot be read cannot be shown to be recent.
    expect(
      (await fantasyPoints(database(windows("locked", "soon")), url, "secret", now)).status,
    ).toBe("fail");
    // Blind is not healthy; no open season is.
    expect(
      await fantasyPoints(database(new Response("upstream", { status: 503 })), url, "secret", now),
    ).toMatchObject({
      status: "fail",
      detail: expect.stringContaining("gameweek windows unreadable (503)"),
    });
    expect(
      (
        await fantasyPoints(
          database(windows("live"), new Response("{}", { status: 500 })),
          url,
          "secret",
          now,
        )
      ).status,
    ).toBe("fail");
    expect(
      await fantasyPoints(
        database(
          windows("live"),
          new Response('{"code":"PT404","message":"fantasy_season_closed"}', { status: 404 }),
        ),
        url,
        "secret",
        now,
      ),
    ).toEqual({ name: "fantasy_points", status: "ok", detail: "no Fantasy season is open" });
    expect(pointsEscalateHours(undefined)).toBe(6);
    expect(pointsEscalateHours("12")).toBe(12);
    expect(pointsEscalateHours("0")).toBeNull();
    expect(pointsEscalateHours("6h")).toBeNull();
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
