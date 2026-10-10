import { describe, expect, it } from "bun:test";

import { managementQuery, pauseTick, resumeTick, type Query } from "./pepites-tick-pause";

/** A cron table in memory: the job's active flag and ticks in flight. */
function fakeCron(state: { active: boolean; running: number[] }) {
  const calls: string[] = [];
  const query: Query = async (sql) => {
    calls.push(sql);
    if (sql.startsWith("select active from cron.job")) return [{ active: state.active }];
    if (sql.includes("cron.alter_job")) {
      state.active = sql.includes("active := true");
      return [{ alter_job: null }];
    }
    if (sql.includes("cron.job_run_details")) return [{ running: state.running.shift() ?? 0 }];
    throw new Error(`unexpected sql: ${sql}`);
  };
  return { query, calls };
}

const noSleep = async () => {};

describe("pauseTick", () => {
  it("records the previous state before changing anything, then pauses the job", async () => {
    const state = { active: true, running: [0] };
    const { query, calls } = fakeCron(state);
    const recorded: boolean[] = [];
    const previous = await pauseTick(query, {
      recordPrevious: (active) => recorded.push(active),
      sleep: noSleep,
    });
    expect(previous).toBe(true);
    expect(recorded).toEqual([true]);
    expect(state.active).toBe(false);
    expect(calls.findIndex((sql) => sql.includes("cron.alter_job"))).toBeGreaterThan(0);
    expect(calls.find((sql) => sql.includes("cron.alter_job"))).toContain("'pepites-tick'");
  });

  it("waits for a tick already in flight before returning", async () => {
    const state = { active: true, running: [1, 1, 0] };
    const { query } = fakeCron(state);
    let slept = 0;
    await pauseTick(query, {
      recordPrevious: () => {},
      sleep: async () => {
        slept += 1;
      },
    });
    expect(slept).toBe(2);
  });

  it("gives up, without running the photo job, when a tick never ends", async () => {
    const state = { active: true, running: [1, 1, 1] };
    const { query } = fakeCron(state);
    await expect(
      pauseTick(query, { recordPrevious: () => {}, sleep: noSleep, attempts: 3 }),
    ).rejects.toThrow("pepites_tick_still_running");
  });

  it("leaves an already paused job alone", async () => {
    const state = { active: false, running: [0] };
    const { query, calls } = fakeCron(state);
    expect(await pauseTick(query, { recordPrevious: () => {}, sleep: noSleep })).toBe(false);
    expect(calls.some((sql) => sql.includes("cron.alter_job"))).toBe(false);
  });

  it("never touches the Pépites mode, so readers keep seeing Pépites", async () => {
    const state = { active: true, running: [0] };
    const { query, calls } = fakeCron(state);
    await pauseTick(query, { recordPrevious: () => {}, sleep: noSleep });
    await resumeTick(query, true);
    expect(calls.join("\n")).not.toContain("pepites_configure");
    expect(calls.join("\n")).not.toContain("pepites_settings");
  });
});

describe("resumeTick", () => {
  it("switches the job back on when it was on before", async () => {
    const state = { active: false, running: [] };
    const { query } = fakeCron(state);
    await resumeTick(query, true);
    expect(state.active).toBe(true);
  });

  it("leaves it paused when it was paused before the run", async () => {
    const state = { active: false, running: [] };
    const { query, calls } = fakeCron(state);
    await resumeTick(query, false);
    expect(state.active).toBe(false);
    expect(calls).toHaveLength(0);
  });
});

describe("managementQuery", () => {
  it("posts the SQL to the project's Management API and never puts the token in the URL", async () => {
    const seen: Array<{ url: string; init: RequestInit }> = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      seen.push({ url, init });
      return new Response(JSON.stringify([{ active: true }]), { status: 200 });
    }) as unknown as typeof fetch;
    const rows = await managementQuery(
      "tkewgajrljbwgwedqsxn",
      "secret-token",
      fetchImpl,
    )("select 1");
    expect(rows).toEqual([{ active: true }]);
    expect(seen[0].url).toBe(
      "https://api.supabase.com/v1/projects/tkewgajrljbwgwedqsxn/database/query",
    );
    expect(seen[0].url).not.toContain("secret-token");
    expect(JSON.parse(String(seen[0].init.body))).toEqual({ query: "select 1" });
  });

  it("fails on an error response with the status only", async () => {
    const fetchImpl = (async () =>
      new Response("token rejected", { status: 401 })) as unknown as typeof fetch;
    await expect(managementQuery("ref", "t", fetchImpl)("select 1")).rejects.toThrow(
      "management_query_401",
    );
  });
});
