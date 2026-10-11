import { describe, expect, test } from "bun:test";
import {
  assertReadOnly,
  createCompareClient,
  fixturesNeedingFallback,
  PRODUCTION_SNAPSHOT_SQL,
  renderMarkdown,
  runCompare,
  type ProductionFixture,
} from "./sofascore-live-shadow-compare";

const NOW = new Date("2026-10-11T19:50:00Z");
const KICKOFF = Date.parse("2026-10-11T19:00:00Z") / 1000;

const event = (id: number, statusType: string, code: number, home: number, away: number) => ({
  id,
  startTimestamp: KICKOFF,
  roundInfo: { round: 4 },
  status: { type: statusType, code },
  homeTeam: { id: 10 },
  awayTeam: { id: 20 },
  homeScore: { current: home },
  awayScore: { current: away },
  tournament: { uniqueTournament: { id: 937 } },
  season: { id: 102220 },
  changes: { changeTimestamp: Math.floor(NOW.getTime() / 1000) - 30 },
});

const mappings = [
  ["competition", "937", "c"],
  ["season", "102220", "s"],
  ["round", "102220:4", "r"],
  ["team", "10", "th"],
  ["team", "20", "ta"],
  ["fixture", "111", "f111"],
].map(([entity_type, external_id, internal_entity_id]) => ({
  provider_name: "sofascore",
  entity_type,
  external_id,
  internal_entity_id,
  active: true,
}));

const prod = (over: Partial<ProductionFixture> = {}): ProductionFixture => ({
  id: "f111",
  externalId: "111",
  kickoffAt: "2026-10-11T19:00:00Z",
  status: "live_first_half",
  period: "first_half",
  homeScore: 0,
  awayScore: 0,
  providerUpdatedAt: "2026-10-11T19:20:00Z",
  sourceSequence: 0,
  finalizedAt: null,
  ...over,
});

function deps(live: unknown[], fixtures: ProductionFixture[], last: unknown[] = []) {
  const paths: string[] = [];
  const sql: string[] = [];
  return {
    paths,
    sql,
    deps: {
      now: () => NOW,
      query: async (q: string) => {
        assertReadOnly(q);
        sql.push(q);
        return [{ snapshot: { mappings, fixtures } }];
      },
      client: {
        getJson: async (path: string) => {
          paths.push(path);
          return { events: path.includes("get-live-events") ? live : last, hasNextPage: false };
        },
        quota: () => ({ limit: 500, remaining: 400 }),
        requestsSent: () => paths.length,
      },
    },
  };
}

describe("sofascore live shadow compare", () => {
  test("the production read is a single SELECT", () => {
    expect(() => assertReadOnly(PRODUCTION_SNAPSHOT_SQL)).not.toThrow();
    expect(PRODUCTION_SNAPSHOT_SQL).not.toMatch(/\b(insert|update|delete|alter|drop|create)\b/i);
  });

  test("a goal on SofaScore not yet in production would change the fixture", async () => {
    const { deps: d, paths } = deps([event(111, "inprogress", 6, 1, 0)], [prod()]);
    const report = await runCompare(d);
    expect(paths).toEqual(["tournaments/get-live-events?sport=football"]);
    expect(report.requestsSent).toBe(1);
    expect(report.rows).toHaveLength(1);
    expect(report.rows[0]).toMatchObject({
      eventId: "111",
      wouldChange: "yes",
      differences: ["score"],
      sofascore: { score: "1-0" },
      production: { score: "0-0", status: "live_first_half" },
    });
    expect(renderMarkdown(report)).toContain("| 111 | 4 | live |");
  });

  test("identical state is no change", async () => {
    const { deps: d } = deps([event(111, "inprogress", 6, 0, 0)], [prod()]);
    expect((await runCompare(d)).rows[0].wouldChange).toBe("no");
  });

  test("a mapped finished event without scores is rejected, not unmapped", async () => {
    const finished = {
      ...event(111, "finished", 100, 0, 0),
      homeScore: undefined,
      awayScore: undefined,
    };
    const { deps: d } = deps([finished], [prod()]);
    const report = await runCompare(d);
    expect(report.rows[0].wouldChange).toBe("rejected");
    expect(report.unmapped).toEqual([]);
    expect(report.rejected).toEqual([
      { sofascoreEventId: "111", reason: "finished_without_score" },
    ]);
    expect(renderMarkdown(report)).toContain("| rejected |");
  });

  test("a transient live-list failure consumes one request without retrying", async () => {
    let sent = 0;
    const api = createCompareClient("fake-key", {
      fetch: async () => {
        sent += 1;
        return new Response("{}", { status: 503 });
      },
      runtime: { sleep: async () => undefined, random: () => 0 },
    });
    const { deps: d } = deps([], [prod()]);
    await expect(runCompare({ ...d, client: api })).rejects.toThrow("Provider error 503");
    expect(sent).toBe(1);
    expect(api.requestsSent()).toBe(1);
  });

  test("a transient fallback failure stays within the two-request poll cap", async () => {
    let sent = 0;
    const api = createCompareClient("fake-key", {
      fetch: async () => {
        sent += 1;
        return new Response(sent === 1 ? '{"events":[]}' : "{}", {
          status: sent === 1 ? 200 : 503,
        });
      },
      runtime: { sleep: async () => undefined, random: () => 0 },
    });
    const { deps: d } = deps([], [prod()]);
    await expect(runCompare({ ...d, client: api })).rejects.toThrow("Provider error 503");
    expect(sent).toBe(2);
    expect(api.requestsSent()).toBe(2);
  });

  test("an older SofaScore change than production is blocked by the freshness guard", async () => {
    const { deps: d } = deps(
      [event(111, "inprogress", 7, 1, 0)],
      [prod({ providerUpdatedAt: "2026-10-11T19:49:59Z" })],
    );
    const report = await runCompare(d);
    expect(report.rows[0].wouldChange).toBe("blocked_stale");
  });

  test("unmapped events, unknown statuses and foreign matches are reported", async () => {
    const foreign = {
      ...event(5, "inprogress", 6, 0, 0),
      tournament: { uniqueTournament: { id: 8 } },
    };
    const { deps: d } = deps(
      [event(222, "inprogress", 6, 0, 0), event(333, "inprogress", 20, 0, 0), foreign],
      [],
    );
    const report = await runCompare(d);
    expect(report.rows[0].wouldChange).toBe("not_mapped");
    expect(report.unmapped).toEqual([{ sofascoreEventId: "222", missing: ["fixture"] }]);
    expect(report.unknownStatus).toEqual([
      { sofascoreEventId: "333", rawStatusType: "inprogress", rawStatusCode: 20 },
    ]);
  });

  test("a live fixture missing from the live list triggers exactly one fallback request", async () => {
    const { deps: d, paths } = deps([], [prod()], [event(111, "finished", 100, 2, 1)]);
    const report = await runCompare(d);
    expect(paths).toHaveLength(2);
    expect(paths[1]).toContain("tournaments/get-last-matches");
    expect(report.fallbackUsed).toBe(true);
    expect(report.rows[0]).toMatchObject({
      source: "last_matches",
      wouldChange: "yes",
      differences: ["status", "period", "score"],
    });
  });

  test("no fallback when nothing is expected live, or when disabled", () => {
    const ids = new Set<string>();
    expect(fixturesNeedingFallback([prod({ status: "finished" })], ids, NOW)).toEqual([]);
    expect(
      fixturesNeedingFallback(
        [prod({ status: "not_started", kickoffAt: "2026-10-12T19:00:00Z" })],
        ids,
        NOW,
      ),
    ).toEqual([]);
    expect(fixturesNeedingFallback([prod()], ids, NOW)).toHaveLength(1);
    expect(fixturesNeedingFallback([prod()], new Set(["111"]), NOW)).toEqual([]);
  });

  test("allowFallback false keeps it to one request and lists the fixture as absent", async () => {
    const { deps: d, paths } = deps([], [prod()]);
    const report = await runCompare({ ...d, allowFallback: false });
    expect(paths).toHaveLength(1);
    expect(report.absentFromSofascore).toEqual([
      { eventId: "111", status: "live_first_half", kickoffAt: "2026-10-11T19:00:00Z" },
    ]);
  });
});
