import { describe, expect, test } from "bun:test";
import { FootballError } from "../errors";
import { providerFixture } from "./performance-fixtures";
import {
  parseSofascoreDetail,
  parseSofascoreIncidents,
  parseSofascoreLineups,
  parseSofascoreStatistics,
} from "./sofascore-adapter";
import {
  isOwnGoalIncident,
  parseSofascoreIncidentsDetailed,
  parseSofascoreLineupsDetailed,
  parseSofascoreStoppage,
} from "../../../../supabase/functions/_shared/sofascore-performance-parse.ts";

const sofa = (name: string) => providerFixture("sofascore", name);
const LIMITED = "16958239"; // Touarga 2-1 FUS: limited coverage
const FULL = "16958238"; // Tiznit 1-3 Tanger: full coverage

describe("Sofascore adapter, from the Phase 0 fixtures", () => {
  test("reads the match summary", () => {
    const summary = parseSofascoreDetail(sofa(`${LIMITED}.detail`));
    expect(summary).toMatchObject({
      provider: "sofascore",
      externalId: LIMITED,
      kickoffAt: "2026-09-26T16:00:00.000Z",
      finished: true,
      homeScore: 2,
      awayScore: 1,
      round: 1,
    });
  });

  test("limited coverage: assists and saves are unknown, not zero", () => {
    const lineups = parseSofascoreLineups(sofa(`${LIMITED}.lineups`));
    expect(lineups.fullCoverage).toBe(false);
    const withStats = lineups.players.filter((player) => player.stats !== null);
    expect(withStats.length).toBeGreaterThan(0);
    for (const player of withStats) {
      expect(player.stats?.assists).toBeNull();
      expect(player.stats?.saves).toBeNull();
    }
  });

  test("full coverage: saves and assists are read", () => {
    const lineups = parseSofascoreLineups(sofa(`${FULL}.lineups`));
    expect(lineups.fullCoverage).toBe(true);
    const keepers = lineups.players.filter((player) => player.position === "G" && player.starter);
    expect(keepers).toHaveLength(2);
    for (const keeper of keepers) expect(typeof keeper.stats?.saves).toBe("number");
    const assists = lineups.players.reduce((sum, p) => sum + (p.stats?.assists ?? 0), 0);
    expect(assists).toBe(4);
  });

  test("lineups carry side, shirt number and 11 starters a side", () => {
    const lineups = parseSofascoreLineups(sofa(`${LIMITED}.lineups`));
    for (const side of ["home", "away"] as const) {
      const starters = lineups.players.filter((p) => p.side === side && p.starter);
      expect(starters).toHaveLength(11);
      expect(starters.every((p) => p.shirtNumber !== null)).toBe(true);
    }
  });

  test("incidents: goals with side and minute; periods skipped", () => {
    const incidents = parseSofascoreIncidents(sofa(`${LIMITED}.incidents`));
    const goals = incidents.filter((i) => i.kind === "goal");
    expect(goals.map((g) => [g.side, g.minute])).toEqual([
      ["away", 70],
      ["home", 27],
      ["home", 12],
    ]);
    expect(incidents.some((i) => i.rawType === "period")).toBe(false);
    // Sofascore labelled the FUS penalty `regular`: it is read as it is sent.
    expect(goals[0]?.rawClass).toBe("regular");
  });

  test("incidents: added time on a card", () => {
    const cards = parseSofascoreIncidents(sofa(`${LIMITED}.incidents`)).filter(
      (i) => i.kind === "yellow_card",
    );
    expect(cards.find((c) => c.minute === 90)?.addedMinutes).toBe(4);
  });

  test("incidents: penalties, a missed penalty, and red cards in the other matches", () => {
    const kinds = new Set(
      ["16958236", "17132480", "16408824", "16438990"].flatMap((id) =>
        parseSofascoreIncidents(sofa(`${id}.incidents`)).map((i) => i.kind),
      ),
    );
    expect(kinds.has("penalty_goal")).toBe(true);
    expect(kinds.has("penalty_missed")).toBe(true);
    expect(kinds.has("red_card")).toBe(true);
    expect(kinds.has("second_yellow")).toBe(true);
    expect(kinds.has("unknown")).toBe(false);
  });

  test("an unseen goal class is unknown and keeps its raw labels", () => {
    const [incident] = parseSofascoreIncidents({
      incidents: [{ incidentType: "goal", incidentClass: "ownGoal", time: 10, isHome: true }],
    });
    expect(incident).toMatchObject({ kind: "unknown", rawType: "goal", rawClass: "ownGoal" });
  });

  test("a rescinded incident is dropped", () => {
    expect(
      parseSofascoreIncidents({
        incidents: [
          { incidentType: "card", incidentClass: "red", time: 5, isHome: true, rescinded: true },
        ],
      }),
    ).toEqual([]);
  });

  test("an incident with no minute fails the match instead of being guessed", () => {
    expect(() =>
      parseSofascoreIncidents({ incidents: [{ incidentType: "goal", incidentClass: "regular" }] }),
    ).toThrow(FootballError);
  });

  test("an injuryTime announcement with no side is skipped (event 17256979 shape)", () => {
    const incidents = parseSofascoreIncidents({
      incidents: [
        { incidentType: "period", time: 90, addedTime: 999 },
        {
          incidentType: "substitution",
          incidentClass: "regular",
          time: 90,
          addedTime: 1,
          isHome: false,
        },
        { incidentType: "injuryTime", time: 45, addedTime: 0, length: 2 },
        { incidentType: "goal", incidentClass: "penalty", time: 40, isHome: true },
      ],
    });
    expect(incidents.map((i) => i.kind)).toEqual(["substitution", "penalty_goal"]);
  });

  test("the announced stoppage time is read per half, and anything odd is not known", () => {
    expect(
      parseSofascoreStoppage({
        incidents: [
          { incidentType: "period", time: 45, addedTime: 999 },
          { incidentType: "injuryTime", time: 45, addedTime: 0, length: 7 },
          { incidentType: "injuryTime", time: 90, addedTime: 0, length: 4, isHome: true },
        ],
      }),
    ).toEqual({ firstHalf: 7, secondHalf: 4 });
    // Two announcements that disagree, a length out of range, a rescinded one, garbage.
    expect(
      parseSofascoreStoppage({
        incidents: [
          { incidentType: "injuryTime", time: 45, length: 3 },
          { incidentType: "injuryTime", time: 45, length: 5 },
          { incidentType: "injuryTime", time: 90, length: 45 },
          { incidentType: "injuryTime", time: 90, length: 2, rescinded: true },
          null,
          "x",
        ],
      }),
    ).toEqual({ firstHalf: null, secondHalf: null });
    expect(parseSofascoreStoppage(null)).toEqual({ firstHalf: null, secondHalf: null });
    expect(parseSofascoreStoppage({ incidents: "no" })).toEqual({
      firstHalf: null,
      secondHalf: null,
    });
  });

  test("a score-relevant or known incident with no side still fails the match", () => {
    for (const incident of [
      { incidentType: "card", incidentClass: "yellow", time: 5 },
      { incidentType: "goal", incidentClass: "ownGoal", time: 5 },
      { incidentType: "substitution", incidentClass: "regular", time: 5 },
      { incidentType: "varDecision", incidentClass: "goalAwarded", time: 5 },
      { incidentType: "injuryTime", isHome: true },
    ])
      if (incident.incidentType === "injuryTime") {
        // No minute but also nothing score-relevant: skipped, not failed.
        expect(parseSofascoreIncidents({ incidents: [incident] })).toEqual([]);
      } else {
        expect(() => parseSofascoreIncidents({ incidents: [incident] })).toThrow(FootballError);
      }
  });

  test("unplaced incidents that could matter, or name a player, still fail closed", () => {
    for (const incident of [
      { incidentType: "substitution", incidentClass: "newClass", time: 70 },
      { incidentType: "varDecision", incidentClass: "goalAwarded", time: 70 },
      { incidentType: "injuryTime", time: 45, player: { id: 1, name: "Player" } },
      { incidentType: "injuryTime", time: 45, playerOut: { id: 1, name: "Player" } },
      { incidentType: "newIncident", time: 70, assist1: { id: 1, name: "Player" } },
    ])
      expect(() => parseSofascoreIncidents({ incidents: [incident] })).toThrow(FootballError);
  });
});

describe("Sofascore adapter: fields that are never scored are tolerated (contract C1, F2)", () => {
  const detailed = (raw: unknown) => parseSofascoreIncidentsDetailed(raw);
  const lineupsDetailed = (raw: unknown) => parseSofascoreLineupsDetailed(raw);
  const lineupsRaw = () =>
    structuredClone(sofa("17132481.lineups")) as {
      home: {
        players: {
          player: Record<string, unknown>;
          statistics: Record<string, unknown>;
          [key: string]: unknown;
        }[];
      };
    };

  test("an unplaced incident that cannot be score-relevant is dropped with a diagnostic", () => {
    for (const incident of [
      { incidentType: "varDecision", incidentClass: "regular", time: 70 },
      { incidentType: "newIncident", time: 70 },
      { incidentType: "varDecision" },
    ]) {
      const result = detailed({ incidents: [incident] });
      expect(result.incidents).toEqual([]);
      expect(result.diagnostics).toEqual([
        `incidents.0: dropped (${incident.incidentType} without minute or side)`,
      ]);
    }
  });

  test("a null or wrongly typed incidentClass on an incident that is not score-relevant reads as absent", () => {
    for (const incidentClass of [null, 7, { a: 1 }]) {
      const result = detailed({
        incidents: [{ incidentType: "varDecision", incidentClass, time: 30, isHome: true }],
      });
      expect(result.incidents).toHaveLength(1);
      expect(result.incidents[0]).toMatchObject({
        kind: "unknown",
        rawType: "varDecision",
        rawClass: null,
      });
      expect(result.diagnostics).toEqual([
        "incidents.0.incidentClass: not used (" + typeName(incidentClass) + ")",
      ]);
    }
    // The diagnostics carry paths and JSON types, never values.
    const secret = detailed({
      incidents: [{ incidentType: "varDecision", incidentClass: 12345, time: 30, isHome: true }],
    });
    expect(JSON.stringify(secret.diagnostics)).not.toContain("12345");
  });

  test("a score-relevant incident is still strict: a null incidentClass or a string minute fails", () => {
    for (const incident of [
      { incidentType: "goal", incidentClass: null, time: 30, isHome: true },
      { incidentType: "card", incidentClass: 3, time: 30, isHome: true },
      { incidentType: "goal", incidentClass: "regular", time: "30", isHome: true },
      { incidentType: "substitution", incidentClass: "regular", time: 30, isHome: "yes" },
      { incidentType: "inGamePenalty", incidentClass: "missed", time: 30.5, isHome: true },
    ])
      expect(() => parseSofascoreIncidents({ incidents: [incident] })).toThrow(FootballError);
  });

  test("a null rating reads as absent for that player only, with a diagnostic", () => {
    const raw = lineupsRaw();
    raw.home.players[0]!.statistics.rating = null;
    const { lineups, diagnostics } = lineupsDetailed(raw);
    expect(lineups.players[0]!.stats!.rating).toBeNull();
    expect(lineups.players[1]!.stats!.rating).not.toBeNull();
    expect(diagnostics).toEqual(["home.players.0.statistics.rating: not used (null)"]);
    expect(() => parseSofascoreLineups(raw)).not.toThrow();
  });

  test("a null position or a null name reads as absent; the id still identifies him", () => {
    const raw = lineupsRaw();
    const before = parseSofascoreLineups(sofa("17132481.lineups")).players[3]!;
    raw.home.players[3]!.player.position = null;
    raw.home.players[3]!.position = 42;
    raw.home.players[3]!.player.name = null;
    const { lineups, diagnostics } = lineupsDetailed(raw);
    const after = lineups.players[3]!;
    expect(after.externalId).toBe(before.externalId);
    expect(after.position).toBeNull();
    expect(after.name).toBe("");
    expect([...diagnostics].sort()).toEqual([
      "home.players.3.player.name: not used (null)",
      "home.players.3.player.position: not used (null)",
      "home.players.3.position: not used (number)",
    ]);
  });

  test("a scored field of the wrong type still fails the lineups (negative control)", () => {
    for (const patch of [
      { minutesPlayed: "90" },
      { goals: "1" },
      { ownGoals: null },
      { saves: "3" },
      { totalPass: "40" },
      { penaltyMiss: true },
    ]) {
      const raw = lineupsRaw();
      Object.assign(raw.home.players[0]!.statistics, patch);
      expect(() => parseSofascoreLineups(raw)).toThrow(FootballError);
    }
    const raw = lineupsRaw();
    raw.home.players[0]!.player.id = "1140820";
    expect(() => parseSofascoreLineups(raw)).toThrow(FootballError);
    const sub = lineupsRaw();
    sub.home.players[0]!.substitute = "false";
    expect(() => parseSofascoreLineups(sub)).toThrow(FootballError);
  });

  test("a goal/ownGoal is still unknown to the parser and recognised by isOwnGoalIncident", () => {
    const [incident] = parseSofascoreIncidents({
      incidents: [
        {
          incidentType: "goal",
          incidentClass: "ownGoal",
          time: 10,
          isHome: true,
          player: { id: 1, name: "x" },
        },
      ],
    });
    expect(incident!.kind).toBe("unknown");
    expect(isOwnGoalIncident(incident!)).toBe(true);
    expect(isOwnGoalIncident({ rawType: "goal", rawClass: "regular" })).toBe(false);
  });
});

const typeName = (value: unknown): string =>
  value === null ? "null" : Array.isArray(value) ? "array" : typeof value;

describe("Sofascore adapter (continued)", () => {
  test("statistics lines keep the shots-on-goal and keeper-save keys", () => {
    const lines = parseSofascoreStatistics(sofa(`${FULL}.statistics`));
    const keys = new Set(lines.map((line) => line.key));
    expect(keys.has("shotsOnGoal")).toBe(true);
    expect(keys.has("goalkeeperSaves")).toBe(true);
  });

  test("a changed shape is rejected with paths only, never values", () => {
    try {
      parseSofascoreDetail({ event: { id: "not-a-number", secretLooking: "abc123" } });
      throw new Error("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(FootballError);
      expect((error as FootballError).code).toBe("invalid_provider_payload");
      expect((error as Error).message).not.toContain("not-a-number");
      expect((error as Error).message).not.toContain("abc123");
    }
  });
});
