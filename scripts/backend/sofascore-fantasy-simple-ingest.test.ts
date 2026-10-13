import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { providerFixture } from "../../src/backend/football/provider/performance-fixtures";
import {
  parseSofascoreIncidents,
  parseSofascoreLineups,
  parseSofascoreStatistics,
} from "../../src/backend/football/provider/sofascore-adapter";
import {
  fetchMatch,
  planItems,
  prepareAll,
  snapshotFrom,
  summaryOf,
} from "./sofascore-fantasy-simple-ingest";
import {
  MAX_WRITE_FIXTURES,
  REHEARSAL_MARKER,
  SCHEMA_SQL,
  appliedProblems,
  buildDoBlock,
  buildReport,
  candidatesSql,
  extractRehearsalResult,
  planSha256,
  resultProblems,
  selectFixtures,
  stateSql,
  writerProblems,
  type Candidate,
  type WriteState,
} from "./sofascore-fantasy-simple-lib";

const uuid = (n: number) => `b0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const SEASON = "d03223b0-8f4a-4309-93e1-2a708d7c3584";

const candidate = (n: number, event: string, over: Partial<Candidate> = {}): Candidate => ({
  fixtureId: uuid(n),
  sofascoreEventId: event,
  homeTeamId: uuid(100 + n),
  awayTeamId: uuid(200 + n),
  status: "finished",
  finalized: true,
  homeScore: 2,
  awayScore: 1,
  round: 3,
  gameweek: 3,
  gameweekStatus: "provisional",
  adaptiveEnabled: true,
  observations: 0,
  linked: false,
  ...over,
});

const stubProvider = (event: string) => ({
  getLineups: async () => parseSofascoreLineups(providerFixture("sofascore", `${event}.lineups`)),
  getIncidents: async () =>
    parseSofascoreIncidents(providerFixture("sofascore", `${event}.incidents`)),
  getStatistics: async () =>
    parseSofascoreStatistics(providerFixture("sofascore", `${event}.statistics`)),
});

async function world(skip: string[] = []) {
  const cands = [candidate(1, "17132481"), candidate(2, "16958239")];
  const fetched = new Map();
  for (const c of cands)
    fetched.set(c.fixtureId, await fetchMatch(stubProvider(c.sofascoreEventId), c));
  const ids = new Set<string>();
  for (const f of fetched.values())
    for (const p of f.data.lineups.players) if (!skip.includes(p.externalId)) ids.add(p.externalId);
  const snapshot = await snapshotFrom(
    [...ids].map((externalId, i) => ({
      id: uuid(9000 + i),
      externalId,
      appPlayerId: uuid(7000000 + Number(externalId)),
      active: true,
      reviewed: true,
      version: "t",
      updatedAt: "2026-10-11T00:00:00.000Z",
    })),
    "2026-10-11T00:00:00.000Z",
  );
  return { cands, fetched, snapshot };
}

describe("selection", () => {
  test("only finished, finalized, adaptive, unobserved fixtures of the round are fetched", () => {
    const s = selectFixtures(
      [
        candidate(1, "1"),
        candidate(2, "2", { status: "scheduled" }),
        candidate(3, "3", { finalized: false }),
        candidate(4, "4", { adaptiveEnabled: false }),
        candidate(5, "5", { gameweekStatus: "finalizing" }),
        candidate(6, "6", { observations: 2 }),
        candidate(7, "7", { round: 4 }),
        candidate(8, "8", { gameweek: null }),
      ],
      { round: 3 },
    );
    expect(s.selected.map((c) => c.sofascoreEventId)).toEqual(["1"]);
    expect(Object.fromEntries(s.skipped.map((x) => [x.sofascoreEventId, x.reason]))).toEqual({
      "2": "not_finished",
      "3": "not_finalized",
      "4": "adaptive_not_enabled_for_gameweek",
      "5": "gameweek_finalizing",
      "6": "already_has_observation",
      "8": "no_gameweek_assignment",
    });
    expect(
      selectFixtures([candidate(6, "6", { observations: 2 })], {
        includeObserved: true,
      }).selected,
    ).toHaveLength(1);
  });
});

describe("report and plan", () => {
  test("a full-coverage and a limited-coverage fixture are both ready; counts are right", async () => {
    const { cands, fetched, snapshot } = await world();
    const prepared = await prepareAll(cands, fetched, snapshot, "2026-10-11T12:00:00.000Z");
    const report = buildReport({ selected: cands, skipped: [] }, prepared);
    expect(report.totals.ready).toBe(2);
    expect(report.totals.readyFullMode).toBe(1);
    expect(report.totals.readySimpleMode).toBe(1);
    expect(report.totals.playersScored).toBe(prepared.reduce((n, p) => n + p.result.rows, 0));
    expect(report.unmappedWorklist).toEqual([]);
    expect(summaryOf(cands[0]!).homeScore).toBe(2);
  });

  test("unmapped appearing players form the worklist (ids and shirts, no names) and hold their fixture back", async () => {
    const probe = await world();
    const lineup = probe.fetched.get(uuid(1)).data.lineups.players;
    // 895127 started and scored a penalty: an unmapped scorer is never left out, so he holds it.
    const starter = lineup.find((p: { externalId: string }) => p.externalId === "895127")!;
    const { cands, fetched, snapshot } = await world([starter.externalId]);
    const prepared = await prepareAll(cands, fetched, snapshot, "2026-10-11T12:00:00.000Z");
    const report = buildReport({ selected: cands, skipped: [] }, prepared);
    expect(report.totals.ready).toBe(1);
    expect(report.totals.blocked).toBe(1);
    expect(report.unmappedWorklist).toHaveLength(1);
    expect(report.unmappedWorklist[0]).toMatchObject({
      sofascoreId: starter.externalId,
      shirtNumber: starter.shirtNumber,
      fixtures: ["17132481"],
    });
    expect(JSON.stringify(report)).not.toContain(starter.name);
  });

  test("the plan hash ignores observation times and changes with the facts", async () => {
    const { cands, fetched, snapshot } = await world();
    const a = planItems(await prepareAll(cands, fetched, snapshot, "2026-10-11T12:00:00.000Z"));
    const b = planItems(await prepareAll(cands, fetched, snapshot, "2026-10-12T08:30:00.000Z"));
    expect(planSha256(a)).toBe(planSha256(b));
    expect(planSha256(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(planSha256(a.slice(0, 1))).not.toBe(planSha256(a));
  });
});

describe("SQL", () => {
  const schema = {
    adaptiveSchema: true,
    linksTable: true,
    wrapper: true,
    observationsTable: true,
  };

  test("the reads are single SELECTs and mention no other provider", () => {
    for (const sql of [SCHEMA_SQL, candidatesSql(SEASON, schema), stateSql([uuid(1)])]) {
      expect(sql.trim().toLowerCase().startsWith("select")).toBe(true);
      expect(sql.includes(";")).toBe(false);
      expect(sql.toLowerCase()).not.toContain("flashscore");
      expect(sql).not.toMatch(/\b(insert|update|delete|alter|drop|create)\b/i);
    }
    expect(() => candidatesSql("not-a-uuid", schema)).toThrow();
  });

  test("missing migrations degrade the read instead of failing it", () => {
    const sql = candidatesSql(SEASON, {
      adaptiveSchema: false,
      linksTable: false,
      wrapper: false,
      observationsTable: false,
    });
    expect(sql).not.toContain("football_provider_fixture_links");
    expect(sql).not.toContain("fantasy_fixture_observations");
    expect(sql).not.toContain("fantasy_adaptive_enabled");
  });

  test("the rehearsal block ends in a deliberate raise, the apply block does not", async () => {
    const { cands, fetched, snapshot } = await world();
    const items = planItems(await prepareAll(cands, fetched, snapshot, "2026-10-11T12:00:00.000Z"));
    const rehearse = buildDoBlock("rehearse", items);
    const apply = buildDoBlock("apply", items);
    expect(rehearse).toContain(`raise exception '${REHEARSAL_MARKER} %'`);
    expect(apply).not.toContain("raise exception");
    for (const sql of [rehearse, apply]) {
      expect(sql.match(/api\.service_record_sofascore_fantasy_observation\(/g)).toHaveLength(
        items.length,
      );
      expect(sql).toContain("set_config('request.jwt.claim.role', 'service_role', true)");
      expect(sql.toLowerCase()).not.toContain("flashscore");
    }
    expect(() => buildDoBlock("apply", [])).toThrow();
    expect(() => buildDoBlock("apply", Array(MAX_WRITE_FIXTURES + 1).fill(items[0]))).toThrow();
  });

  test("rehearsal results are parsed from the error and compared with what the builder expected", async () => {
    const { cands, fetched, snapshot } = await world();
    const items = planItems(await prepareAll(cands, fetched, snapshot, "2026-10-11T12:00:00.000Z"));
    const result = items.map((i) => ({
      fixtureId: i.fixtureId,
      created: true,
      latest: true,
      simpleReady: true,
      fullReady: i.expectedMode === "full",
    }));
    const body = JSON.stringify({
      message: `ERROR: ${REHEARSAL_MARKER} ${JSON.stringify(result)}`,
    });
    expect(extractRehearsalResult(body)).toEqual(result);
    expect(resultProblems(result, items)).toEqual([]);
    expect(resultProblems(null, items)).toHaveLength(1);
    expect(
      resultProblems(
        result.map((r) => ({ ...r, fullReady: !r.fullReady })),
        items,
      ).length,
    ).toBe(items.length);
    expect(
      resultProblems(
        result.map((r) => ({ ...r, created: false })),
        items,
      ).length,
    ).toBe(items.length);
  });
});

describe("one writer, and the apply check", () => {
  const state = (over: Partial<WriteState> = {}): WriteState => ({
    observations: 5,
    otherDigest: "x",
    links: 1,
    forFixtures: [],
    emailMode: "off",
    liveRefreshEnabled: false,
    lifecycleTickEnabled: false,
    finalizingGameweeks: 0,
    busySessions: 0,
    ...over,
  });

  test("refuses while a cron is on or a session is busy", () => {
    expect(writerProblems(state())).toEqual([]);
    expect(
      writerProblems(state({ emailMode: "on", lifecycleTickEnabled: true, busySessions: 2 })),
    ).toHaveLength(3);
  });

  test("an apply is verified from a fresh read", async () => {
    const { cands, fetched, snapshot } = await world();
    const items = planItems(await prepareAll(cands, fetched, snapshot, "2026-10-11T12:00:00.000Z"));
    const after = state({
      observations: 5 + items.length,
      links: 1 + items.length,
      forFixtures: items.map((i, index) => ({
        id: 100 + index,
        fixtureId: i.fixtureId,
        digest: "d",
        source: "provider-reconciled",
        fullReady: i.expectedMode === "full",
        simpleReady: true,
      })),
    });
    expect(appliedProblems(state(), after, items, null)).toEqual([]);
    expect(appliedProblems(state(), { ...after, otherDigest: "y" }, items, null)).toContain(
      "observations of other fixtures changed",
    );
  });
  test("a correction verifies the added row and preserves older provider observations", async () => {
    const { cands, fetched, snapshot } = await world();
    const items = planItems(
      await prepareAll(cands, fetched, snapshot, "2026-10-11T12:00:00.000Z"),
    ).slice(0, 1);
    const historical = {
      id: 10,
      fixtureId: items[0]!.fixtureId,
      digest: "historical",
      source: "sportsmonks",
      fullReady: false,
      simpleReady: false,
    };
    const corrected = {
      ...historical,
      id: 11,
      digest: "correction",
      source: "provider-reconciled",
      fullReady: items[0]!.expectedMode === "full",
      simpleReady: true,
    };
    const before = state({ forFixtures: [historical] });
    const after = state({
      observations: 6,
      forFixtures: [historical, corrected],
    });
    expect(appliedProblems(before, after, items, null)).toEqual([]);
    expect(
      appliedProblems(
        before,
        {
          ...after,
          forFixtures: [historical, { ...corrected, simpleReady: false }],
        },
        items,
        null,
      ),
    ).toContain(`fixture ${items[0]!.fixtureId}: observation is not simple-ready`);
    expect(
      appliedProblems(
        before,
        {
          ...after,
          forFixtures: [historical, { ...corrected, source: "sportsmonks" }],
        },
        items,
        null,
      ),
    ).toContain(`fixture ${items[0]!.fixtureId}: unexpected source sportsmonks`);
    expect(
      appliedProblems(
        before,
        {
          ...after,
          forFixtures: [{ ...historical, digest: "changed" }, corrected],
        },
        items,
        null,
      ),
    ).toContain(`fixture ${items[0]!.fixtureId}: historical observation 10 changed`);
    expect(appliedProblems(before, { ...after, forFixtures: [historical] }, items, null)).toContain(
      `fixture ${items[0]!.fixtureId}: expected one new observation, got 0`,
    );
    expect(
      appliedProblems(
        before,
        {
          ...after,
          forFixtures: [historical, corrected, { ...corrected, id: 12 }],
        },
        items,
        null,
      ),
    ).toContain(`fixture ${items[0]!.fixtureId}: expected one new observation, got 2`);
  });
});

describe("no other provider anywhere in the new code", () => {
  test("sources, migration and workflows do not mention Flashscore", () => {
    const files = [
      "src/backend/fantasy/sofascore-fantasy.ts",
      "scripts/backend/sofascore-fantasy-simple-lib.ts",
      "scripts/backend/sofascore-fantasy-simple-ingest.ts",
      "supabase/migrations/20261011120000_sofascore_fantasy_observations.sql",
      "supabase/tests/database/sofascore_fantasy_observations.test.sql",
      ".github/workflows/sofascore-fantasy-simple-read.yml",
      ".github/workflows/sofascore-fantasy-simple-rehearsal.yml",
      ".github/workflows/sofascore-fantasy-simple-apply.yml",
    ];
    for (const file of files) {
      expect(readFileSync(file, "utf8").toLowerCase()).not.toContain("flashscore");
    }
  });
});
