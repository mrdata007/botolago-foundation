import { describe, expect, test } from "bun:test";
import { FootballError } from "../errors";
import { providerFixture } from "./performance-fixtures";
import {
  parseSofascoreDetail,
  parseSofascoreIncidents,
  parseSofascoreLineups,
  parseSofascoreStatistics,
} from "./sofascore-adapter";

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
