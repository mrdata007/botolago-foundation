import { describe, expect, test } from "bun:test";
import {
  casablancaDate,
  planSofascoreIdBridge,
  type BridgeInput,
  type SofascoreEvent,
} from "./sofascore-id-bridge";
import { CLUB_PROVIDER_TEAMS } from "./identity/club-registry";
import {
  SOFASCORE_TEAM_NAMES,
  SOFASCORE_TEAM_ROWS,
  reviewedTeamTable,
} from "./sofascore-team-table";

const T = (n: number) => `00000000-0000-4000-8000-0000000000${String(n).padStart(2, "0")}`;
const TEAMS = new Map<number, string>([
  [1, T(1)],
  [2, T(2)],
  [3, T(3)],
]);
const ts = (iso: string) => Math.floor(Date.parse(iso) / 1000);
const ev = (
  id: number,
  home: number,
  away: number,
  iso: string,
  round = 1,
  status = "finished",
): SofascoreEvent => ({
  id,
  startTimestamp: ts(iso),
  roundInfo: { round },
  status: { type: status },
  homeTeam: { id: home },
  awayTeam: { id: away },
});
const fx = (id: string, home: number, away: number, iso: string, round: number | null = 1) => ({
  id,
  kickoffAt: iso,
  roundNumber: round,
  homeTeamId: TEAMS.get(home)!,
  awayTeamId: TEAMS.get(away)!,
});

const base = (over: Partial<BridgeInput>): BridgeInput => ({
  events: [],
  competition: { externalId: "937", internalId: "comp-1" },
  season: { externalId: "102220", internalId: "season-1" },
  teams: TEAMS,
  rounds: [{ id: "round-1", roundNumber: 1 }],
  fixtures: [],
  existing: [],
  ...over,
});

describe("casablancaDate", () => {
  test("late UTC kickoff in Ramadan-free winter is the same day (UTC+1 is next day after 23:00)", () => {
    // 23:30 UTC on 1 Dec is 00:30 on 2 Dec in Casablanca.
    expect(casablancaDate(new Date("2026-12-01T23:30:00Z"))).toBe("2026-12-02");
    expect(casablancaDate(new Date("2026-12-01T22:30:00Z"))).toBe("2026-12-01");
  });
});

describe("planSofascoreIdBridge", () => {
  test("an event also wanted by an ambiguous fixture is not mapped by the round fallback", () => {
    // f1 sees two same-day events; f2 reaches one of them (101) by round only.
    const plan = planSofascoreIdBridge(
      base({
        events: [
          ev(100, 1, 2, "2026-08-22T18:00:00Z", 1),
          ev(101, 1, 2, "2026-08-22T20:00:00Z", 2),
        ],
        fixtures: [
          fx("f1", 1, 2, "2026-08-22T18:00:00Z", 1),
          fx("f2", 1, 2, "2026-09-30T18:00:00Z", 2),
        ],
        rounds: [
          { id: "round-1", roundNumber: 1 },
          { id: "round-2", roundNumber: 2 },
        ],
      }),
    );
    expect(plan.rows.filter((r) => r.entityType === "fixture")).toEqual([]);
    expect(plan.report.fixturesMultiMatch.map((m) => m.fixtureId).sort()).toEqual(["f1", "f2"]);
  });

  test("two SofaScore teams paired with one internal team are a conflict and map nothing", () => {
    const duplicated = new Map<number, string>([
      [1, T(1)],
      [2, T(2)],
      [3, T(1)],
    ]);
    const plan = planSofascoreIdBridge(
      base({
        teams: duplicated,
        events: [ev(100, 1, 2, "2026-08-22T18:00:00Z"), ev(102, 3, 2, "2026-08-29T18:00:00Z")],
        fixtures: [fx("f1", 1, 2, "2026-08-22T18:00:00Z")],
      }),
    );
    expect(plan.report.conflicts).toContainEqual({
      entityType: "team",
      externalId: "3",
      internalId: T(1),
      existingExternalId: "1",
      existingInternalId: T(1),
    });
    const mapped = plan.rows.map((r) => `${r.entityType}:${r.externalId}`);
    expect(mapped).not.toContain("team:1");
    expect(mapped).not.toContain("team:3");
    expect(mapped.filter((m) => m.startsWith("fixture:"))).toEqual([]);
  });

  test("normal match creates competition, season, round, team and fixture rows", () => {
    const plan = planSofascoreIdBridge(
      base({
        events: [ev(100, 1, 2, "2026-08-22T18:00:00Z")],
        fixtures: [fx("f1", 1, 2, "2026-08-22T18:00:00Z")],
      }),
    );
    const kinds = plan.rows.map((r) => `${r.entityType}:${r.externalId}->${r.internalId}`);
    expect(kinds).toContain("competition:937->comp-1");
    expect(kinds).toContain("season:102220->season-1");
    expect(kinds).toContain("round:102220:1->round-1");
    expect(kinds).toContain(`team:1->${T(1)}`);
    expect(kinds).toContain("fixture:100->f1");
    expect(plan.report.fixturesMatched).toEqual([
      { fixtureId: "f1", externalId: "100", flags: [] },
    ]);
    expect(plan.report.conflicts).toEqual([]);
  });

  test("timezone edge: kickoff 23:30 UTC matches the event by Casablanca date", () => {
    // Event at 00:30 Casablanca on the 2nd (23:30 UTC on the 1st); the fixture
    // is stored at the same instant. A UTC-date comparison would also agree, so
    // pair with a fixture stored an hour later in UTC on the 2nd: same Casablanca day.
    const plan = planSofascoreIdBridge(
      base({
        events: [ev(100, 1, 2, "2026-12-01T23:30:00Z")],
        fixtures: [fx("f1", 1, 2, "2026-12-02T08:00:00Z")],
      }),
    );
    expect(plan.report.fixturesMatched).toEqual([
      { fixtureId: "f1", externalId: "100", flags: [] },
    ]);
  });

  test("timezone edge: same UTC date but different Casablanca date is not a date match", () => {
    // 22:30 UTC (23:30 Casablanca, 1 Dec) vs 23:30 UTC (00:30, 2 Dec): different days, same round.
    const plan = planSofascoreIdBridge(
      base({
        events: [ev(100, 1, 2, "2026-12-01T22:30:00Z")],
        fixtures: [fx("f1", 1, 2, "2026-12-01T23:30:00Z")],
      }),
    );
    expect(plan.report.fixturesMatched).toEqual([
      { fixtureId: "f1", externalId: "100", flags: ["matched_by_round"] },
    ]);
  });

  test("postponed/rescheduled: unique pair in the round matches by round and is flagged", () => {
    const plan = planSofascoreIdBridge(
      base({
        events: [ev(100, 1, 2, "2026-09-30T18:00:00Z")],
        fixtures: [fx("f1", 1, 2, "2026-08-22T18:00:00Z")],
      }),
    );
    expect(plan.report.fixturesMatched[0].flags).toEqual(["matched_by_round"]);
    expect(plan.rows.some((r) => r.entityType === "fixture" && r.internalId === "f1")).toBe(true);
  });

  test("no match: different round, no date match, is reported and not mapped", () => {
    const plan = planSofascoreIdBridge(
      base({
        events: [ev(100, 1, 2, "2026-09-30T18:00:00Z", 5)],
        fixtures: [fx("f1", 1, 2, "2026-08-22T18:00:00Z", 1)],
      }),
    );
    expect(plan.report.fixturesNoMatch).toEqual(["f1"]);
    expect(plan.rows.some((r) => r.entityType === "fixture")).toBe(false);
  });

  test("no match: two fixtures for the pair in the same round do not fall back to round", () => {
    const plan = planSofascoreIdBridge(
      base({
        events: [ev(100, 1, 2, "2026-09-30T18:00:00Z")],
        fixtures: [fx("f1", 1, 2, "2026-08-22T18:00:00Z"), fx("f2", 1, 2, "2026-08-23T18:00:00Z")],
      }),
    );
    expect(plan.report.fixturesNoMatch.sort()).toEqual(["f1", "f2"]);
  });

  test("2+ matches on the same date are reported, not mapped", () => {
    const plan = planSofascoreIdBridge(
      base({
        events: [ev(100, 1, 2, "2026-08-22T15:00:00Z"), ev(101, 1, 2, "2026-08-22T18:00:00Z", 2)],
        fixtures: [fx("f1", 1, 2, "2026-08-22T18:00:00Z")],
      }),
    );
    expect(plan.report.fixturesMultiMatch).toEqual([
      { fixtureId: "f1", externalIds: ["100", "101"] },
    ]);
    expect(plan.rows.some((r) => r.entityType === "fixture")).toBe(false);
  });

  test("an event wanted by two fixtures is ambiguous for both", () => {
    const plan = planSofascoreIdBridge(
      base({
        events: [ev(100, 1, 2, "2026-08-22T18:00:00Z")],
        fixtures: [
          fx("f1", 1, 2, "2026-08-22T18:00:00Z"),
          fx("f2", 1, 2, "2026-08-22T20:00:00Z", 2),
        ],
      }),
    );
    expect(plan.report.fixturesMultiMatch.map((m) => m.fixtureId).sort()).toEqual(["f1", "f2"]);
  });

  test("already mapped to the same target is reported and creates nothing", () => {
    const plan = planSofascoreIdBridge(
      base({
        events: [ev(100, 1, 2, "2026-08-22T18:00:00Z")],
        fixtures: [fx("f1", 1, 2, "2026-08-22T18:00:00Z")],
        existing: [{ entityType: "fixture", externalId: "100", internalId: "f1" }],
      }),
    );
    expect(plan.report.alreadyMapped).toContainEqual({
      entityType: "fixture",
      externalId: "100",
      internalId: "f1",
    });
    expect(plan.rows.some((r) => r.entityType === "fixture")).toBe(false);
    expect(plan.report.conflicts).toEqual([]);
  });

  test("conflict: external id already mapped to another fixture", () => {
    const plan = planSofascoreIdBridge(
      base({
        events: [ev(100, 1, 2, "2026-08-22T18:00:00Z")],
        fixtures: [fx("f1", 1, 2, "2026-08-22T18:00:00Z")],
        existing: [{ entityType: "fixture", externalId: "100", internalId: "other" }],
      }),
    );
    expect(plan.report.conflicts).toEqual([
      {
        entityType: "fixture",
        externalId: "100",
        internalId: "f1",
        existingExternalId: "100",
        existingInternalId: "other",
      },
    ]);
    expect(plan.rows.some((r) => r.entityType === "fixture")).toBe(false);
  });

  test("conflict: fixture already mapped to a live (non-postponed) different event", () => {
    const plan = planSofascoreIdBridge(
      base({
        events: [ev(100, 1, 2, "2026-08-22T18:00:00Z"), ev(55, 1, 2, "2026-08-22T18:00:00Z", 1)],
        fixtures: [fx("f1", 1, 2, "2026-08-22T18:00:00Z")],
        existing: [{ entityType: "fixture", externalId: "999", internalId: "f1" }],
      }),
    );
    expect(plan.report.fixturesMultiMatch.length).toBe(1);
    const only = planSofascoreIdBridge(
      base({
        events: [ev(100, 1, 2, "2026-08-22T18:00:00Z")],
        fixtures: [fx("f1", 1, 2, "2026-08-22T18:00:00Z")],
        existing: [{ entityType: "fixture", externalId: "999", internalId: "f1" }],
      }),
    );
    expect(only.report.conflicts).toHaveLength(1);
    expect(only.report.repoints).toEqual([]);
  });

  test("team missing from the reviewed table is reported and its events skipped", () => {
    const plan = planSofascoreIdBridge(
      base({
        events: [ev(100, 1, 9, "2026-08-22T18:00:00Z")],
        fixtures: [fx("f1", 1, 2, "2026-08-22T18:00:00Z")],
      }),
    );
    expect(plan.report.teamsMissingFromTable).toEqual([9]);
    expect(plan.report.eventsSkippedMissingTeam).toEqual([100]);
    expect(plan.report.fixturesNoMatch).toEqual(["f1"]);
  });

  test("round missing internally is reported, never created", () => {
    const plan = planSofascoreIdBridge(
      base({
        events: [ev(100, 1, 2, "2026-08-22T18:00:00Z", 7)],
        rounds: [],
      }),
    );
    expect(plan.report.roundsMissingInternally).toEqual([7]);
    expect(plan.rows.some((r) => r.entityType === "round")).toBe(false);
  });

  describe("postponed events replayed under a new id (real probe, 2026-10-10)", () => {
    // 47696 v 55039 analogue: postponed 16958240, replayed as finished 17132480.
    const postponed = ev(16958240, 1, 2, "2026-08-22T18:00:00Z", 1, "postponed");
    const replayed = ev(17132480, 1, 2, "2026-09-30T18:00:00Z", 1, "finished");

    test("maps the replayed event, never the postponed one", () => {
      const plan = planSofascoreIdBridge(
        base({
          events: [postponed, replayed],
          fixtures: [fx("f1", 1, 2, "2026-08-22T18:00:00Z")],
        }),
      );
      expect(plan.report.fixturesMatched).toEqual([
        { fixtureId: "f1", externalId: "17132480", flags: ["matched_by_round"] },
      ]);
      expect(plan.rows.filter((r) => r.entityType === "fixture").map((r) => r.externalId)).toEqual([
        "17132480",
      ]);
    });

    test("fixture already mapped to the postponed id is re-pointed, not conflicted", () => {
      const plan = planSofascoreIdBridge(
        base({
          events: [postponed, replayed],
          fixtures: [fx("f1", 1, 2, "2026-08-22T18:00:00Z")],
          existing: [{ entityType: "fixture", externalId: "16958240", internalId: "f1" }],
        }),
      );
      expect(plan.repoints).toEqual([
        {
          fixtureId: "f1",
          fromExternalId: "16958240",
          toExternalId: "17132480",
          flags: ["matched_by_round"],
        },
      ]);
      expect(plan.report.conflicts).toEqual([]);
      expect(plan.rows.some((r) => r.entityType === "fixture")).toBe(false);
    });

    test("only postponed events: newest wins and is flagged postponed_only", () => {
      // 24394 v 41757 analogue: old postponed id and its re-created, still postponed, id.
      const oldOne = ev(16958242, 1, 2, "2026-08-22T18:00:00Z", 1, "postponed");
      const newOne = ev(17217059, 1, 2, "2026-10-12T17:00:00Z", 1, "postponed");
      const plan = planSofascoreIdBridge(
        base({ events: [oldOne, newOne], fixtures: [fx("f1", 1, 2, "2026-08-22T18:00:00Z")] }),
      );
      expect(plan.report.fixturesMatched).toEqual([
        { fixtureId: "f1", externalId: "17217059", flags: ["matched_by_round", "postponed_only"] },
      ]);
    });

    test("postponed_only tie on start time keeps the highest id", () => {
      const a = ev(10, 1, 2, "2026-08-22T18:00:00Z", 1, "postponed");
      const b = ev(11, 1, 2, "2026-08-22T18:00:00Z", 1, "postponed");
      const plan = planSofascoreIdBridge(
        base({ events: [a, b], fixtures: [fx("f1", 1, 2, "2026-08-22T18:00:00Z")] }),
      );
      expect(plan.report.fixturesMatched[0].externalId).toBe("11");
      expect(plan.report.fixturesMatched[0].flags).toEqual(["postponed_only"]);
    });

    test("a later run re-points a postponed_only mapping to the replacement", () => {
      const oldOne = ev(16958242, 1, 2, "2026-08-22T18:00:00Z", 1, "postponed");
      const newOne = ev(17217059, 1, 2, "2026-10-12T17:00:00Z", 1, "finished");
      const plan = planSofascoreIdBridge(
        base({
          events: [oldOne, newOne],
          fixtures: [fx("f1", 1, 2, "2026-08-22T18:00:00Z")],
          existing: [{ entityType: "fixture", externalId: "16958242", internalId: "f1" }],
        }),
      );
      expect(plan.repoints[0]).toMatchObject({
        fromExternalId: "16958242",
        toExternalId: "17217059",
      });
    });
  });
});

describe("reviewed team table", () => {
  test("covers the 16 clubs with ids from the registry, matching the 2026-10-10 standings", () => {
    expect(SOFASCORE_TEAM_ROWS).toHaveLength(16);
    expect(new Set(SOFASCORE_TEAM_ROWS.map((r) => r.sofascoreTeamId))).toEqual(
      new Set(Object.keys(SOFASCORE_TEAM_NAMES).map(Number)),
    );
    for (const club of CLUB_PROVIDER_TEAMS) {
      expect(SOFASCORE_TEAM_NAMES[club.sofascoreTeamId]).toBeDefined();
    }
  });

  test("internal uuids are an unreviewed TODO, so the committed table is empty", () => {
    expect(reviewedTeamTable().size).toBe(0);
  });
});
