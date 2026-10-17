import { describe, expect, test } from "bun:test";
import {
  createPlannedMatchLoader,
  databaseGuard,
  exitCodeOf,
  loadPlannedMatch,
  parsePlan,
  PRODUCTION_PROJECT_REF,
  RECORD_CONFIRMATION,
} from "./reconciled-scoring-ingestion";
import { providerFixture } from "../../src/backend/football/provider/performance-fixtures";

const STAGING = "https://abcdefghijklmnopqrst.supabase.co";

describe("databaseGuard", () => {
  test("local mode needs nothing and opens no database", () => {
    expect(databaseGuard("local", {})).toBeNull();
  });
  test("production is refused in every database mode", () => {
    for (const mode of ["dry-run", "record"] as const) {
      expect(() =>
        databaseGuard(mode, {
          SUPABASE_URL: `https://${PRODUCTION_PROJECT_REF}.supabase.co`,
          SUPABASE_SECRET_KEY: "k",
          RECONCILED_INGESTION_CONFIRMATION: RECORD_CONFIRMATION,
        }),
      ).toThrow("production_refused");
    }
  });
  test("a write needs the typed confirmation; a dry run does not", () => {
    expect(() =>
      databaseGuard("record", { SUPABASE_URL: STAGING, SUPABASE_SECRET_KEY: "k" }),
    ).toThrow("confirmation_missing");
    expect(databaseGuard("dry-run", { SUPABASE_URL: STAGING, SUPABASE_SECRET_KEY: "k" })).toEqual({
      url: STAGING,
      secret: "k",
    });
    expect(
      databaseGuard("record", {
        SUPABASE_URL: `${STAGING}/`,
        SUPABASE_SECRET_KEY: "k",
        RECONCILED_INGESTION_CONFIRMATION: RECORD_CONFIRMATION,
      }),
    ).toEqual({ url: STAGING, secret: "k" });
  });
  test("an odd URL or a missing key is refused", () => {
    expect(() =>
      databaseGuard("dry-run", { SUPABASE_URL: "https://evil.example", SUPABASE_SECRET_KEY: "k" }),
    ).toThrow("url_invalid");
    expect(() => databaseGuard("dry-run", { SUPABASE_URL: STAGING })).toThrow("secret_missing");
  });
});

describe("parsePlan", () => {
  const entry = {
    sofascoreId: "17132481",
    flashscoreId: "W81WOcb5",
    appFixtureId: "f0000000-0000-4000-8000-000000000001",
    homeTeamId: "c1000000-0000-4000-8000-000000000001",
    awayTeamId: "c1000000-0000-4000-8000-000000000002",
  };
  test("accepts a reviewed plan", () => {
    expect(parsePlan([entry])).toEqual([entry]);
  });
  test("refuses an empty plan, a missing field, or a match listed twice", () => {
    expect(() => parsePlan([])).toThrow("plan_invalid");
    expect(() => parsePlan([{ ...entry, homeTeamId: undefined }])).toThrow("homeTeamId");
    expect(() =>
      parsePlan([entry, { ...entry, appFixtureId: "f0000000-0000-4000-8000-000000000002" }]),
    ).toThrow("twice");
  });
});

describe("exitCodeOf", () => {
  const f = (status: string) => ({ outcome: { status } }) as never;
  const report = (...statuses: string[]) =>
    ({ mode: "record", fixtures: statuses.map(f), counts: {}, ok: false }) as never;
  test("refusals outrank uncertainty, which outranks blocks", () => {
    expect(exitCodeOf(report("recorded", "already-recorded"), [])).toBe(0);
    expect(exitCodeOf(report("recorded", "blocked"), [])).toBe(2);
    expect(exitCodeOf(report("uncertain", "blocked"), [])).toBe(3);
    expect(exitCodeOf(report("refused", "uncertain"), [])).toBe(4);
  });
  test("local mode is judged on what was prepared", () => {
    expect(exitCodeOf(null, [{ request: {} } as never])).toBe(0);
    expect(exitCodeOf(null, [{ request: null } as never])).toBe(2);
  });
});

describe("loadPlannedMatch", () => {
  const entry = { sofascoreId: "17132481", flashscoreId: "W81WOcb5" };
  test("committed reads the saved payloads and needs no provider settings", async () => {
    const m = await loadPlannedMatch("committed", entry, {});
    expect(m.sofascore.lineups).toBeDefined();
    expect(m.flashscore.incidents).toBeDefined();
  });
  test("live refuses to start without the provider settings, before any request", async () => {
    const realFetch = globalThis.fetch;
    let requests = 0;
    globalThis.fetch = (() => {
      requests += 1;
      return Promise.reject(new Error("no request expected"));
    }) as unknown as typeof fetch;
    try {
      await expect(loadPlannedMatch("live", entry, {})).rejects.toThrow();
      // The Sofascore settings are complete; only the Flashscore host is missing.
      await expect(loadPlannedMatch("live", entry, { RAPIDAPI_KEY: "k" })).rejects.toThrow();
      expect(requests).toBe(0);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
  test("live parses both providers and retains their quotas for the next match", async () => {
    const realFetch = globalThis.fetch;
    let requests = 0;
    const sofaNames = ["detail", "lineups", "incidents", "statistics"];
    const flashNames = ["data", "summary", "lineups", "statistics"];
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      const isSofa = url.includes("sofascore.p.rapidapi.com");
      expect(url).not.toContain("test-key");
      expect((init?.headers as Record<string, string>)["x-rapidapi-key"]).toBe("test-key");
      const index = requests++;
      const provider = isSofa ? "sofascore" : "flashscore";
      const id = isSofa ? entry.sofascoreId : entry.flashscoreId;
      const name = isSofa ? sofaNames[index] : flashNames[index - 4];
      return new Response(JSON.stringify(providerFixture(provider, `${id}.${name}`)), {
        headers: {
          "x-ratelimit-requests-limit": "500",
          "x-ratelimit-requests-remaining": isSofa ? String(102 - index) : "400",
        },
      });
    }) as typeof fetch;
    try {
      const loader = createPlannedMatchLoader("live", {
        RAPIDAPI_KEY: "test-key",
        FLASHSCORE_RAPIDAPI_HOST: "flashlive.example",
      });
      const loaded = await loader.load(entry);
      expect(loaded.sofascore.summary.finished).toBe(true);
      expect(loaded.flashscore.summary.finished).toBe(true);
      expect(loaded.sofascore.summary.homeScore).toBe(loaded.flashscore.summary.homeScore);
      expect(loader.usage()).toEqual({
        sofascore: { requests: 4, limit: 500, remaining: 99 },
        flashscore: { requests: 4, limit: 500, remaining: 400 },
      });
      await expect(loader.load(entry)).rejects.toMatchObject({ code: "provider_rate_limited" });
      expect(requests).toBe(8);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});
