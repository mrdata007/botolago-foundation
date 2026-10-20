import { describe, expect, test } from "bun:test";
import {
  APPLY_CONFIRMATION,
  buildDoBlock,
  EXIT,
  extractBlockResult,
  jsonbLiteral,
  PARTIAL_MARKER,
  REHEARSAL_MARKER,
  renderMarkdown,
  runPoll,
  stateSql,
  validateIngestCall,
  writerProblems,
  type DbState,
} from "./sofascore-results-sync";
import { assertReadOnly } from "./sofascore-id-bridge-fetch";
import type { ProductionFixture } from "./sofascore-live-shadow-compare";
import type { SofascoreIngestCall } from "../../supabase/functions/_shared/sofascore-fixtures.ts";

const NOW = new Date("2026-10-11T21:00:00Z");
const KICKOFF = Date.parse("2026-10-11T19:00:00Z") / 1000;
const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const event = (
  id: number,
  statusType: string,
  code: number,
  home: number,
  away: number,
  change = Math.floor(NOW.getTime() / 1000) - 30,
) => ({
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
  changes: { changeTimestamp: change },
});

const mappings = [
  ["competition", "937", U(1)],
  ["season", "102220", U(2)],
  ["round", "102220:4", U(3)],
  ["team", "10", U(4)],
  ["team", "20", U(5)],
  ["fixture", "111", U(100)],
  ["fixture", "222", U(200)],
].map(([entity_type, external_id, internal_entity_id]) => ({
  provider_name: "sofascore",
  entity_type,
  external_id,
  internal_entity_id,
  active: true,
}));

const prod = (over: Partial<ProductionFixture> = {}): ProductionFixture => ({
  id: U(100),
  externalId: "111",
  kickoffAt: "2026-10-11T19:00:00Z",
  status: "not_started",
  period: "pre_match",
  homeScore: null,
  awayScore: null,
  providerUpdatedAt: "2026-10-10T08:00:00Z",
  sourceSequence: 0,
  finalizedAt: null,
  ...over,
});

const state = (over: Partial<DbState> = {}): DbState => ({
  live_refresh_enabled: false,
  email_mode: "off",
  lifecycle_tick_enabled: false,
  mapped_fixtures: 2,
  others_digest: "d1",
  mappings_digest: "m1",
  ...over,
});

interface Harness {
  sql: string[];
  writes: string[];
  paths: string[];
}

/** A fake production: `fixtures` is mutated by the fake DO block runner. */
function harness(
  live: unknown[],
  last: unknown[],
  fixtures: ProductionFixture[],
  options: {
    settings?: Partial<DbState>;
    executeAs?: (sql: string, fixtures: ProductionFixture[]) => { status: number; body: string };
  } = {},
) {
  const log: Harness = { sql: [], writes: [], paths: [] };
  return {
    log,
    fixtures,
    deps: {
      now: () => NOW,
      query: async (q: string) => {
        assertReadOnly(q);
        log.sql.push(q);
        if (q.includes("live_refresh_enabled")) return [{ state: state(options.settings) }];
        return [{ snapshot: { mappings, fixtures: structuredClone(fixtures) } }];
      },
      execute: async (sql: string) => {
        log.writes.push(sql);
        return options.executeAs
          ? options.executeAs(sql, fixtures)
          : {
              status: 400,
              body: JSON.stringify({
                message: `ERROR: P0001: ${REHEARSAL_MARKER} {"planned":1,"results":[{"externalId":"111","status":"live_first_half","period":"first_half","homeScore":1,"awayScore":0,"providerUpdatedAt":"x","finalizedAt":null}],"failed":[]}`,
              }),
            };
      },
      client: {
        getJson: async (path: string) => {
          log.paths.push(path);
          return { events: path.includes("get-live-events") ? live : last, hasNextPage: false };
        },
        quota: () => ({ limit: 500, remaining: 400 }),
        requestsSent: () => log.paths.length,
      },
    },
  };
}

describe("payload validation", () => {
  const call = (): SofascoreIngestCall => ({
    p_provider_name: "sofascore",
    p_external_id: "111",
    p_fixture: {
      competitionId: U(1),
      seasonId: U(2),
      roundId: U(3),
      homeTeamId: U(4),
      awayTeamId: U(5),
      venueId: null,
      kickoffAt: "2026-10-11T19:00:00.000Z",
      status: "finished",
      period: "post_match",
      minute: null,
      addedTime: null,
      homeScore: 2,
      awayScore: 1,
      providerUpdatedAt: "2026-10-11T20:50:00.000Z",
      sourceSequence: 1760215800000,
      sourceVersion: "sofascore:111:1760215800000",
      finalizedAt: "2026-10-11T21:00:00.000Z",
    },
  });

  test("a well-formed call becomes one jsonb literal", () => {
    expect(() => validateIngestCall(call())).not.toThrow();
    const literal = jsonbLiteral(call());
    expect(literal.startsWith("'{")).toBe(true);
    expect(literal.endsWith("'::jsonb")).toBe(true);
    expect(literal).toContain('"status":"finished"');
  });

  test("an unknown key, a bad type or an injection is refused", () => {
    const extra = call();
    (extra.p_fixture as unknown as Record<string, unknown>).evil = 1;
    expect(() => validateIngestCall(extra)).toThrow("keys");
    const badStatus = call();
    (badStatus.p_fixture as unknown as Record<string, unknown>).status = "finished'; drop";
    expect(() => validateIngestCall(badStatus)).toThrow("status");
    const badId = { ...call(), p_external_id: "1; drop table x" };
    expect(() => validateIngestCall(badId)).toThrow("external id");
    const badUuid = call();
    (badUuid.p_fixture as unknown as Record<string, unknown>).seasonId = "x'";
    expect(() => validateIngestCall(badUuid)).toThrow("seasonId");
    const oneScore = call();
    (oneScore.p_fixture as unknown as Record<string, unknown>).awayScore = null;
    expect(() => validateIngestCall(oneScore)).toThrow("score");
    const finalizedLive = call();
    (finalizedLive.p_fixture as unknown as Record<string, unknown>).status = "live_first_half";
    expect(() => validateIngestCall(finalizedLive)).toThrow("finalizedAt");
  });
});

describe("DO block", () => {
  const write = { call: undefined as unknown as SofascoreIngestCall, fixtureId: U(100) };
  const make = () => {
    const base = {
      p_provider_name: "sofascore" as const,
      p_external_id: "111",
      p_fixture: {
        competitionId: U(1),
        seasonId: U(2),
        roundId: null,
        homeTeamId: U(4),
        awayTeamId: U(5),
        venueId: null,
        kickoffAt: "2026-10-11T19:00:00.000Z",
        status: "live_first_half" as const,
        period: "first_half" as const,
        minute: null,
        addedTime: null,
        homeScore: 1,
        awayScore: 0,
        providerUpdatedAt: "2026-10-11T19:20:00.000Z",
        sourceSequence: 1,
        sourceVersion: "sofascore:111:1",
        finalizedAt: null,
      },
    };
    return { ...write, call: base };
  };

  test("rehearsal always ends in the deliberate raise, apply never contains it", () => {
    const rehearse = buildDoBlock("rehearse", [make()]);
    const apply = buildDoBlock("apply", [make()]);
    expect(rehearse).toContain(`raise exception '${REHEARSAL_MARKER} %'`);
    expect(apply).not.toContain(REHEARSAL_MARKER);
    expect(apply).toContain(PARTIAL_MARKER);
    for (const sql of [rehearse, apply]) {
      expect(sql).toContain("api.ingest_football_fixture('sofascore', '111',");
      expect(sql).toContain("SOFASCORE_SYNC_MAPPING_CHANGED");
      expect(sql).not.toContain("set_config");
      expect(sql.match(/api\.ingest_football_fixture/g)).toHaveLength(1);
    }
    expect(() => buildDoBlock("apply", [])).toThrow("nothing to write");
  });

  test("the state read is a single select and refuses a non-uuid exclusion", () => {
    expect(() => assertReadOnly(stateSql([U(100)]))).not.toThrow();
    expect(() => stateSql(["x'; drop"])).toThrow("not a uuid");
  });
});

describe("result extraction and refusals", () => {
  test("the rehearsal result is read out of the error body", () => {
    const body = JSON.stringify({
      message: `Failed to run sql query: ERROR: P0001: ${REHEARSAL_MARKER} {"planned":1,"results":[],"failed":[{"externalId":"1","sqlstate":"P0001","message":"STALE_UPDATE"}]}\n`,
    });
    expect(extractBlockResult(body, REHEARSAL_MARKER)?.failed[0].message).toBe("STALE_UPDATE");
    expect(extractBlockResult("nothing", REHEARSAL_MARKER)).toBeNull();
  });

  test("a live refresh that is on or unknown refuses to write", () => {
    expect(writerProblems(state())).toEqual([]);
    expect(writerProblems(state({ live_refresh_enabled: true }))[0]).toContain("live refresh");
    expect(writerProblems(state({ live_refresh_enabled: null }))).toHaveLength(1);
  });
});

describe("runPoll", () => {
  test("uses at most two requests and writes nothing when production already matches", async () => {
    const h = harness(
      [],
      [{ ...event(111, "notstarted", 0, 0, 0), homeScore: undefined, awayScore: undefined }],
      [prod()],
    );
    const out = await runPoll("apply", h.deps);
    expect(h.log.paths).toHaveLength(2);
    expect(h.log.paths[1]).toContain("get-last-matches");
    expect(h.log.paths[1]).toContain("pageIndex=0");
    expect(out.exit).toBe(EXIT.ok);
    expect(out.outcome).toBe("SOFASCORE_SYNC_NOTHING_TO_WRITE");
    expect(h.log.writes).toHaveLength(0);
  });

  test("refuses to write while the SportsMonks live refresh is on", async () => {
    const h = harness([event(111, "inprogress", 6, 1, 0)], [], [prod()], {
      settings: { live_refresh_enabled: true },
    });
    const out = await runPoll("apply", h.deps);
    expect(out.exit).toBe(EXIT.refused);
    expect(out.problems[0]).toContain("live refresh");
    expect(h.log.writes).toHaveLength(0);
    expect(renderMarkdown("apply", out)).toContain("no (refused)");
  });

  test("never writes stale, unknown, unmapped or locked fixtures", async () => {
    const stale = prod({ providerUpdatedAt: "2026-10-11T20:59:59Z" });
    const h = harness(
      [
        event(111, "inprogress", 6, 1, 0, Math.floor(NOW.getTime() / 1000) - 3600),
        event(333, "inprogress", 6, 0, 0),
        { ...event(444, "weird", 99, 0, 0) },
      ],
      [event(222, "finished", 100, 2, 1)],
      [
        stale,
        prod({
          id: U(200),
          externalId: "222",
          status: "finished",
          period: "post_match",
          homeScore: 1,
          awayScore: 1,
        }),
      ],
    );
    const out = await runPoll("apply", h.deps);
    const reasons = Object.fromEntries(out.rows.map((r) => [r.comparison.eventId, r.reason]));
    expect(reasons["111"]).toContain("newer than SofaScore");
    expect(reasons["333"]).toContain("not mapped");
    expect(reasons["222"]).toContain("final score");
    expect(out.unknownStatus).toEqual(["444 weird/99"]);
    expect(out.outcome).toBe("SOFASCORE_SYNC_NOTHING_TO_WRITE");
    expect(h.log.writes).toHaveLength(0);
  });

  test("a finished match whose production score is empty is written", async () => {
    const h = harness(
      [],
      [event(222, "finished", 100, 2, 1)],
      [prod({ id: U(200), externalId: "222", status: "finished", period: "post_match" })],
    );
    const out = await runPoll("rehearse", h.deps);
    expect(out.rows[0].action).toBe("write");
  });

  test("rehearsal: the DO block rolls back, and the re-read proves it", async () => {
    const h = harness([event(111, "inprogress", 6, 1, 0)], [], [prod()]);
    const out = await runPoll("rehearse", h.deps);
    expect(h.log.writes).toHaveLength(1);
    expect(h.log.writes[0]).toContain(REHEARSAL_MARKER);
    expect(out.exit).toBe(EXIT.ok);
    expect(out.outcome).toBe("SOFASCORE_SYNC_REHEARSAL_ROLLED_BACK_AND_VERIFIED");
    const md = renderMarkdown("rehearse", out, { n: 1, of: 1 });
    expect(md).toContain("rolled back (rehearsal)");
    expect(md).toContain("would be live_first_half 1-0");
  });

  test("rehearsal that did not roll back is flagged for review", async () => {
    const h = harness([event(111, "inprogress", 6, 1, 0)], [], [prod()], {
      executeAs: (_sql, fixtures) => {
        fixtures[0] = prod({
          status: "live_first_half",
          period: "first_half",
          homeScore: 1,
          awayScore: 0,
        });
        return { status: 201, body: "[]" };
      },
    });
    const out = await runPoll("rehearse", h.deps);
    expect(out.exit).toBe(EXIT.needsReview);
    expect(out.problems.join(" ")).toContain("raise did not run");
    expect(out.problems.join(" ")).toContain("rollback did not hold");
  });

  test("apply: verified when production now shows SofaScore's state", async () => {
    const h = harness([event(111, "inprogress", 6, 1, 0)], [], [prod()], {
      executeAs: (sql, fixtures) => {
        expect(sql).not.toContain(REHEARSAL_MARKER);
        fixtures[0] = prod({
          status: "live_first_half",
          period: "first_half",
          homeScore: 1,
          awayScore: 0,
          providerUpdatedAt: new Date(NOW.getTime() - 30_000).toISOString(),
        });
        return { status: 201, body: "[]" };
      },
    });
    const out = await runPoll("apply", h.deps);
    expect(out.outcome).toBe("SOFASCORE_SYNC_APPLIED_AND_VERIFIED");
    expect(out.exit).toBe(EXIT.ok);
    const md = renderMarkdown("apply", out, { n: 2, of: 12 });
    expect(md).toContain("Apply 2 of 12");
    expect(md).toContain(
      "| 111 | 4 | live | live_first_half 1-0 | not_started - | yes | live_first_half 1-0 |",
    );
  });

  test("apply that committed something else is flagged", async () => {
    const h = harness([event(111, "inprogress", 6, 1, 0)], [], [prod()], {
      executeAs: (_sql, fixtures) => {
        fixtures[0] = prod({
          status: "live_first_half",
          period: "first_half",
          homeScore: 0,
          awayScore: 0,
        });
        return { status: 201, body: "[]" };
      },
    });
    const out = await runPoll("apply", h.deps);
    expect(out.exit).toBe(EXIT.needsReview);
    expect(out.outcome).toBe("SOFASCORE_SYNC_COMMITTED_NEEDS_REVIEW");
  });

  test("apply that fails whole and changes nothing is rolled back, not an alarm", async () => {
    const h = harness([event(111, "inprogress", 6, 1, 0)], [], [prod()], {
      executeAs: () => ({ status: 500, body: "boom" }),
    });
    const out = await runPoll("apply", h.deps);
    expect(out.exit).toBe(EXIT.rolledBack);
    expect(h.log.writes).toHaveLength(1);
  });

  test("apply with one failing call repeats once without it", async () => {
    const f2 = prod({ id: U(200), externalId: "222" });
    let sent = 0;
    const h = harness(
      [event(111, "inprogress", 6, 1, 0), event(222, "inprogress", 6, 0, 1)],
      [],
      [prod(), f2],
      {
        executeAs: (sql, fixtures) => {
          sent += 1;
          if (sent === 1) {
            return {
              status: 400,
              body: JSON.stringify({
                message: `ERROR: P0001: ${PARTIAL_MARKER} {"planned":2,"results":[],"failed":[{"externalId":"222","sqlstate":"P0001","message":"STALE_UPDATE"}]}`,
              }),
            };
          }
          expect(sql).not.toContain("'222'");
          fixtures[0] = prod({
            status: "live_first_half",
            period: "first_half",
            homeScore: 1,
            awayScore: 0,
            providerUpdatedAt: new Date(NOW.getTime() - 30_000).toISOString(),
          });
          return { status: 201, body: "[]" };
        },
      },
    );
    const out = await runPoll("apply", h.deps);
    expect(h.log.writes).toHaveLength(2);
    expect(out.notes[0]).toContain("222");
    expect(out.outcome).toBe("SOFASCORE_SYNC_APPLIED_AND_VERIFIED");
  });

  test("the confirmation phrases are distinct", () => {
    expect(APPLY_CONFIRMATION).toBe("APPLY_SOFASCORE_RESULTS_SYNC");
  });
});
