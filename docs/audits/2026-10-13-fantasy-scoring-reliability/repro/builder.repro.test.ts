// Audit reproductions, 2026-10-13. Not part of the normal suite: run with
//   bun test ./docs/audits/2026-10-13-fantasy-scoring-reliability/repro/
// Each test asserts the CURRENT behaviour at commit 7e8e8ea, so a passing test
// documents the finding; it does not endorse the behaviour.
import { describe, expect, test } from "bun:test";
import { providerFixture } from "../../../../src/backend/football/provider/performance-fixtures";
import {
  parseSofascoreDetail,
  parseSofascoreIncidents,
  parseSofascoreLineups,
  parseSofascoreStatistics,
} from "../../../../src/backend/football/provider/sofascore-adapter";
import {
  buildReviewedIdentitySnapshot,
  type MappingRowInput,
} from "../../../../src/backend/fantasy/reviewed-identities";
import {
  prepareSofascoreObservation,
  type SofascoreMatchData,
} from "../../../../src/backend/fantasy/sofascore-fantasy";
import { scoreCertifiedPlayerFixture } from "../../../../src/backend/fantasy/adaptive-scoring";

const uuid = (n: number) => `a0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const binding = { appFixtureId: uuid(1), homeTeamId: uuid(2), awayTeamId: uuid(3) };
const OBSERVED = "2026-10-11T12:00:00.000Z";
const raw = (name: string) => structuredClone(providerFixture("sofascore", `17132481.${name}`));

function load(): SofascoreMatchData {
  return {
    summary: parseSofascoreDetail(raw("detail")),
    lineups: parseSofascoreLineups(raw("lineups")),
    incidents: parseSofascoreIncidents(raw("incidents")),
    statistics: parseSofascoreStatistics(raw("statistics")),
  };
}
async function prepare(match: SofascoreMatchData) {
  const rows: MappingRowInput[] = match.lineups.players.map((p, i) => ({
    mappingId: uuid(1000 + i),
    provider: "sofascore",
    externalId: p.externalId,
    appPlayerId: uuid(5000000 + Number(p.externalId)),
    active: true,
    reviewed: true,
    version: "test",
    updatedAt: OBSERVED,
  }));
  return prepareSofascoreObservation({
    observedAt: OBSERVED,
    match,
    snapshot: await buildReviewedIdentitySnapshot(rows, OBSERVED),
    binding,
  });
}
const row = (p: Awaited<ReturnType<typeof prepare>>, id: string) =>
  p.request!.payload.players.find((r) => r.identity.sofascoreId === id)!;

describe("F-parse: non-scoring fields fail the whole match", () => {
  test("baseline parses", () => {
    expect(() => parseSofascoreLineups(raw("lineups"))).not.toThrow();
  });
  test("rating: null on ONE player (rating is never scored) rejects every lineup", () => {
    const l = raw("lineups") as { home: { players: { statistics: Record<string, unknown> }[] } };
    l.home.players[0]!.statistics.rating = null;
    expect(() => parseSofascoreLineups(l)).toThrow(/rating/);
  });
  test("player.position: null (display field) rejects every lineup", () => {
    const l = raw("lineups") as { home: { players: { player: Record<string, unknown> }[] } };
    l.home.players[3]!.player.position = null;
    expect(() => parseSofascoreLineups(l)).toThrow(/position/);
  });
  test("incidentClass: null on a placed non-scoring incident rejects all incidents", () => {
    const i = raw("incidents") as { incidents: Record<string, unknown>[] };
    i.incidents.push({ incidentType: "varDecision", incidentClass: null, time: 30, isHome: true });
    expect(() => parseSofascoreIncidents(i)).toThrow(/incidentClass/);
  });
  test("an unplaced non-scoring incident other than injuryTime rejects all incidents", () => {
    const i = raw("incidents") as { incidents: Record<string, unknown>[] };
    i.incidents.push({ incidentType: "varDecision", incidentClass: "goalAwarded" });
    expect(() => parseSofascoreIncidents(i)).toThrow(/no minute or side/);
  });
});

describe("F-scope: one local problem withholds every player of the match", () => {
  test("baseline produces a request with 28 rows", async () => {
    const p = await prepare(load());
    expect(p.blockers).toEqual([]);
    expect(p.rows).toBeGreaterThan(22);
  });
  test("an away goal on the minute of a home double substitution holds ALL rows", async () => {
    const m = load();
    const incidents = m.incidents.map((i) =>
      i.kind === "goal" && i.side === "away" ? { ...i, minute: 77 } : i,
    );
    const p = await prepare({ ...m, incidents });
    const codes = [...new Set(p.blockers.map((b) => b.code))];
    expect(codes).toEqual(["timeline_unresolved"]);
    // Only the four home players changed at 77 are ambiguous, and only for goals conceded /
    // clean sheet; yet no request is produced for any of the ~28 appearing players.
    expect(p.blockers.length).toBe(4);
    expect(p.request).toBeNull();
  });
  test("a second yellow anywhere holds every player (policy hold, recurs weekly)", async () => {
    const m = load();
    const y = m.incidents.find((i) => i.kind === "yellow_card")!;
    const p = await prepare({ ...m, incidents: [...m.incidents, { ...y, kind: "second_yellow" }] });
    expect(p.blockers.map((b) => b.code)).toEqual(["second_yellow_review"]);
    expect(p.request).toBeNull();
  });
  test("an own goal (goal/ownGoal parses as unknown) holds every player", () => {
    const i = raw("incidents") as { incidents: Record<string, unknown>[] };
    i.incidents.push({
      incidentType: "goal",
      incidentClass: "ownGoal",
      time: 30,
      isHome: false,
      player: { id: 1140820, name: "x" },
    });
    const parsed = parseSofascoreIncidents(i);
    expect(parsed.at(-1)!.kind).toBe("unknown");
  });
});

describe("F-minutes: minutesPlayed override is not reconciled with goals conceded", () => {
  test("player subbed off at 46 with minutesPlayed 70 gets a clean sheet although his team conceded at 48", async () => {
    const m = load();
    const off = "2150417"; // home, replaced at 46; away scored at 48
    const lineups = {
      ...m.lineups,
      players: m.lineups.players.map((p) =>
        p.externalId === off ? { ...p, stats: { ...p.stats!, minutesPlayed: 70 } } : p,
      ),
    };
    const p = await prepare({ ...m, lineups });
    expect(p.blockers).toEqual([]);
    const r = row(p, off);
    expect(r.stats.minutes).toBe(70);
    expect(r.stats.goalsConceded).toBe(0); // window still ends at 46
    expect(r.stats.cleanSheet).toBe(true); // contradicts minutes 70 + goal at 48
    expect(r.evidence.cleanSheet!.state).toBe("verified");
    const pts = scoreCertifiedPlayerFixture(
      uuid(1),
      uuid(1),
      "DEF",
      r.stats as never,
      r.evidence as never,
      {
        appearanceShort: 1,
        appearanceFull: 2,
        fullAppearanceMinutes: 60,
        assist: 3,
        goal: { GK: 10, DEF: 6, MID: 5, FWD: 4 },
        cleanSheet: { GK: 4, DEF: 4, MID: 1, FWD: 0 },
        goalsConcededPerPoint: { GK: 2, DEF: 2 },
        savesPerPoint: 3,
        penaltySave: 5,
        penaltyMiss: -2,
        yellowCard: -1,
        redCard: -3,
        secondYellowDismissal: -3,
        ownGoal: -2,
        bonusEnabled: false,
        playerOfMatchEnabled: false,
      } as never,
      "simple",
    );
    expect(pts.some((e) => e.category === "clean_sheet")).toBe(true);
  });
  test("a starter whose minutesPlayed is 0 is recorded as a VERIFIED 1-minute appearance", async () => {
    const m = load();
    const gk = "1140820"; // home starter, 90 minutes, never substituted
    const lineups = {
      ...m.lineups,
      players: m.lineups.players.map((p) =>
        p.externalId === gk ? { ...p, stats: { ...p.stats!, minutesPlayed: 0 } } : p,
      ),
    };
    const p = await prepare({ ...m, lineups });
    expect(p.blockers).toEqual([]);
    expect(row(p, gk).stats.minutes).toBe(1);
    expect(row(p, gk).evidence.minutes!.state).toBe("verified");
    expect(p.minutesFromSofascore).toBe(1); // reported, never held
  });
});

describe("F-stoppage: added time is ignored when ordering goals and substitutions", () => {
  test("a home sub at 90+2 and an away goal at 90+5 hold the WHOLE match as timeline_unresolved", async () => {
    const m = load();
    // Synthetic: one extra away goal at 90+5; summary score raised to match so goals add up.
    const goal = m.incidents.find((i) => i.kind === "goal" && i.side === "away")!;
    const late = { ...goal, minute: 90, addedMinutes: 5 };
    const p = await prepare({
      ...m,
      summary: { ...m.summary, awayScore: (m.summary.awayScore ?? 0) + 1 },
      incidents: [...m.incidents, late],
    });
    // The 90+2 substitution (895127 off, 1182110 on) and the 90+5 goal are both "minute 90".
    expect(new Set(p.blockers.map((b) => b.code))).toEqual(new Set(["timeline_unresolved"]));
    expect(p.request).toBeNull();
  });
});
