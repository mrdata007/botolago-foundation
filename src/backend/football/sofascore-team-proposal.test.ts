import { describe, expect, test } from "bun:test";
import { proposeTeams } from "./sofascore-team-proposal";
import type { InternalFixture, SofascoreEvent } from "./sofascore-id-bridge";

const U = (n: number) => `00000000-0000-4000-8000-0000000000${String(n).padStart(2, "0")}`;
const ts = (iso: string) => Math.floor(Date.parse(iso) / 1000);
const ev = (
  id: number,
  home: number,
  away: number,
  iso: string,
  round: number,
  status = "finished",
): SofascoreEvent => ({
  id,
  startTimestamp: ts(iso),
  roundInfo: { round },
  status: { type: status },
  homeTeam: { id: home },
  awayTeam: { id: away },
});
const fx = (
  id: string,
  home: number,
  away: number,
  iso: string,
  round: number,
): InternalFixture => ({
  id,
  kickoffAt: iso,
  roundNumber: round,
  homeTeamId: U(home),
  awayTeamId: U(away),
});
/** Teams 1..4 (SofaScore 100+n, internal U(n)) meet over distinct days and rounds. */
const day = (n: number) => `2026-09-${String(10 + n).padStart(2, "0")}T18:00:00Z`;
const pairs: [number, number][] = [
  [1, 2],
  [3, 4],
  [1, 3],
  [2, 4],
  [1, 4],
  [2, 3],
];
const events = pairs.map(([h, a], i) => ev(i + 1, 100 + h, 100 + a, day(i), i + 1));
const fixtures = pairs.map(([h, a], i) => fx(`f${i}`, h, a, day(i), i + 1));

describe("proposeTeams", () => {
  test("proposes teams with enough consistent evidence", () => {
    const result = proposeTeams(events, fixtures);
    expect(result.proposal).toEqual({ "101": U(1), "102": U(2), "103": U(3), "104": U(4) });
    expect(result.matchedFixtures).toBe(6);
    expect(result.evidence.every((e) => e.status === "proposed")).toBe(true);
    expect(result.internalTeamsUnpaired).toEqual([]);
  });

  test("too little evidence is not proposed", () => {
    const result = proposeTeams(events.slice(0, 2), fixtures.slice(0, 2));
    expect(result.proposal).toEqual({});
    expect(result.evidence.every((e) => e.status === "too_little_evidence")).toBe(true);
    expect(result.internalTeamsUnpaired.length).toBe(4);
  });

  test("a conflicting internal team blocks the proposal", () => {
    const crossed = fixtures.map((f, i) => (i === 0 ? { ...f, homeTeamId: U(9) } : f));
    const result = proposeTeams(events, crossed);
    expect(result.evidence.find((e) => e.sofascoreTeamId === 101)!.status).toBe("conflict");
    expect(result.proposal["101"]).toBeUndefined();
  });

  test("ambiguous fixtures (two events, same date and kickoff) are skipped", () => {
    const twin = [...events, ev(99, 105, 106, day(0), 1)];
    const result = proposeTeams(twin, fixtures);
    expect(result.fixturesAmbiguous).toBeGreaterThanOrEqual(1);
    expect(result.matchedFixtures).toBe(5);
    expect(result.proposal["101"]).toBeUndefined();
  });

  test("same date, different kickoff instant is resolved by the instant", () => {
    const sameDay = [
      ev(1, 101, 102, "2026-09-10T16:00:00Z", 1),
      ev(2, 103, 104, "2026-09-10T19:00:00Z", 1),
    ];
    const fixes = [
      fx("a", 1, 2, "2026-09-10T16:00:00Z", 1),
      fx("b", 3, 4, "2026-09-10T19:00:00Z", 1),
    ];
    const result = proposeTeams(sameDay, fixes, 1);
    expect(result.proposal).toEqual({ "101": U(1), "102": U(2), "103": U(3), "104": U(4) });
  });

  test("postponed events are ignored", () => {
    const postponed = events.map((e) => ({ ...e, status: { type: "postponed" } }));
    const result = proposeTeams(postponed, fixtures);
    expect(result.proposal).toEqual({});
    expect(result.eventsIgnoredStatus).toBe(6);
  });

  test("two SofaScore teams claiming one internal team are both withheld", () => {
    const split = events.map((e, i) => (i === 2 || i === 4 ? { ...e, homeTeam: { id: 105 } } : e));
    const result = proposeTeams(split, fixtures, 1);
    expect(result.evidence.find((e) => e.sofascoreTeamId === 101)!.status).toBe(
      "duplicate_internal_team",
    );
    expect(result.evidence.find((e) => e.sofascoreTeamId === 105)!.status).toBe(
      "duplicate_internal_team",
    );
    expect(result.proposal["101"]).toBeUndefined();
    expect(result.proposal["105"]).toBeUndefined();
  });
});
