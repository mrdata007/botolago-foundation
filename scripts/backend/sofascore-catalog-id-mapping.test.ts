import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  analyse,
  clubsSql,
  existingSql,
  fetchSofaLineups,
  fixturesSql,
  playersSql,
  smLineupsSql,
  type Collected,
} from "./sofascore-catalog-id-mapping";
import { assertReadOnly } from "./sofascore-id-bridge-fetch";

const SEASON = "11111111-1111-4111-8111-111111111111";
const T1 = "aaaaaaaa-0000-4000-8000-000000000001";
const T2 = "aaaaaaaa-0000-4000-8000-000000000002";
const P1 = "bbbbbbbb-0000-4000-8000-000000000001";

describe("catalog mapping collection", () => {
  test("every query is a single read-only SELECT, with or without names", () => {
    for (const sql of [
      fixturesSql(SEASON),
      smLineupsSql(SEASON),
      clubsSql(false),
      clubsSql(true),
      playersSql(false),
      playersSql(true),
      existingSql(),
    ])
      expect(() => assertReadOnly(sql)).not.toThrow();
  });

  test("names are selected only on request", () => {
    expect(playersSql(false)).toContain("'displayName', null");
    expect(playersSql(true)).toContain("p.display_name");
    expect(clubsSql(false)).not.toContain("t.name");
  });

  test("a season that is not a uuid is refused before any SQL is built", () => {
    expect(() => fixturesSql("x'; drop table y; --")).toThrow(/catalog_mapping_invalid/);
  });
});

const fixture = (
  id: string,
  event: string,
  smH: string,
  smA: string,
  home: string,
  away: string,
) => ({
  fixtureId: id,
  sofascoreEventId: event,
  homeTeamId: home,
  awayTeamId: away,
  smHomeTeamId: smH,
  smAwayTeamId: smA,
});

describe("analyse", () => {
  const collected: Collected = {
    fixtures: [
      fixture("f1", "9001", "10", "20", T1, T2),
      fixture("f2", "9002", "20", "10", T2, T1),
    ],
    smLineups: [
      { fixtureId: "f1", teamId: T1, playerId: P1, shirt: 9, position: "forward" },
      { fixtureId: "f2", teamId: T1, playerId: P1, shirt: 9, position: "forward" },
    ],
    clubs: [
      { internalId: T1, sportsmonksId: "10", sofascoreId: null, sofascoreActive: null },
      { internalId: T2, sportsmonksId: "20", sofascoreId: null, sofascoreActive: null },
    ],
    players: [{ internalId: P1, sportsmonksId: "1001", sofascoreId: null, sofascoreActive: null }],
    existing: [],
  };
  const events = new Map([
    ["9001", { homeTeamId: 100, awayTeamId: 200 }],
    ["9002", { homeTeamId: 200, awayTeamId: 100 }],
  ]);
  const lineup = (side: "home" | "away") => [
    { side, sofascorePlayerId: "777", shirt: 9, position: "F" as const },
  ];

  test("maps clubs and a player end to end, with the request count in the report", () => {
    const report = analyse({
      collected,
      events,
      sofaLineups: new Map([
        ["9001", lineup("home")],
        ["9002", lineup("away")],
      ]),
      showNames: false,
      sofascoreRequests: 5,
      generatedAt: "2026-10-13T00:00:00.000Z",
    });
    expect(report.clubs.proposed.map((c) => [c.sportsmonksId, c.sofascoreId])).toEqual([
      ["10", "100"],
      ["20", "200"],
    ]);
    expect(report.players.proposed[0]).toMatchObject({
      internalId: P1,
      sofascoreId: "777",
      confidence: "multi_match",
    });
    expect(report.inputs.sofascoreRequests).toBe(5);
    expect(report.inputs.fixturesWithBothLineups).toBe(2);
  });

  test("a fixture whose lineup could not be fetched gives no player evidence", () => {
    const report = analyse({
      collected,
      events,
      sofaLineups: new Map(),
      showNames: false,
      sofascoreRequests: 2,
      generatedAt: "2026-10-13T00:00:00.000Z",
    });
    expect(report.players.proposed).toEqual([]);
    expect(report.players.unmapped[0].reason).toBe("no_lineup_evidence");
    expect(report.clubs.proposed).toHaveLength(2);
  });

  test("an inactive SofaScore row blocks a proposal instead of being overwritten", () => {
    const report = analyse({
      collected: {
        ...collected,
        players: [
          { internalId: P1, sportsmonksId: "1001", sofascoreId: "555", sofascoreActive: false },
        ],
        existing: [{ entityType: "player", externalId: "555", internalId: P1, active: false }],
      },
      events,
      sofaLineups: new Map([
        ["9001", lineup("home")],
        ["9002", lineup("away")],
      ]),
      showNames: false,
      sofascoreRequests: 2,
      generatedAt: "2026-10-13T00:00:00.000Z",
    });
    expect(report.players.unmapped[0].reason).toBe("conflicts_with_existing_mapping");
  });
});

describe("fetchSofaLineups", () => {
  const client = (replies: Record<string, unknown>, sent = { n: 0 }) => ({
    requestsSent: () => sent.n,
    getJson: async (path: string) => {
      sent.n += 1;
      const id = path.split("matchId=")[1];
      if (!(id in replies)) throw new Error("boom");
      return replies[id];
    },
  });
  const reply = {
    home: {
      players: [
        { player: { id: 7, name: "A B", position: "F" }, shirtNumber: 9, substitute: false },
      ],
    },
    away: { players: [] },
  };

  test("a failed fixture is counted and skipped, names are dropped unless asked", async () => {
    const r = await fetchSofaLineups(client({ "1": reply }), ["1", "2"], {
      showNames: false,
      maxRequests: 10,
    }).catch((e) => e);
    if (r instanceof Error) throw r;
    expect(r.failed).toEqual(["2"]);
    expect(r.lineups.get("1")).toEqual([
      { side: "home", sofascorePlayerId: "7", shirt: 9, position: "F", displayName: null },
    ]);
    for (const rows of r.lineups.values())
      for (const row of rows) expect(row.displayName).toBeNull();
  });

  test("stops at the request cap instead of spending quota", async () => {
    await expect(
      fetchSofaLineups(client({}), ["1", "2", "3"], { showNames: false, maxRequests: 2 }),
    ).rejects.toThrow(/catalog_mapping_request_cap/);
  });
});

describe("production read workflow", () => {
  const yml = readFileSync(
    ".github/workflows/sofascore-catalog-id-mapping-production-read.yml",
    "utf8",
  );

  test("is owner-only, main-only, pinned to the reviewed commit and cannot write", () => {
    expect(yml).toContain("github.actor == 'mrdata007'");
    expect(yml).toContain("github.ref == 'refs/heads/main'");
    expect(yml).toContain('"$EXPECTED_COMMIT" == "$GITHUB_SHA"');
    expect(yml).toContain("tkewgajrljbwgwedqsxn");
    expect(yml).toContain("--read-production");
    expect(yml).not.toMatch(/--emit-sql|--mode apply|SUPABASE_SECRET_KEY|SERVICE_ROLE/i);
  });

  test("a failure reason reaches the step summary and the log is uploaded", () => {
    expect(yml).toContain("FAILED (exit $status)");
    expect(yml).toContain("tail -n 40");
    expect(yml).toContain("if: always()");
    expect(yml).toContain("catalog-mapping/run.log");
    expect(yml).toContain("catalog-mapping/report.json");
  });
});
