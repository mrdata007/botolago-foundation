import { describe, expect, test } from "bun:test";
import { FootballError } from "../errors";
import {
  parseFlashscoreData,
  parseFlashscoreLineups,
  parseFlashscoreStatistics,
  parseFlashscoreSummary,
} from "./flashscore-adapter";
import { providerFixture } from "./performance-fixtures";

const flash = (name: string) => providerFixture("flashscore", name);
const TOUARGA_FUS = "88o4wcDb";
const KACM_HUSA = "GYlCyyrB";

describe("Flashscore adapter, from the Phase 0 fixtures", () => {
  test("reads the match summary", () => {
    expect(parseFlashscoreData(flash(`${TOUARGA_FUS}.data`))).toMatchObject({
      provider: "flashscore",
      externalId: TOUARGA_FUS,
      kickoffAt: "2026-09-26T16:00:00.000Z",
      finished: true,
      homeScore: 2,
      awayScore: 1,
      round: 1,
    });
  });

  test("goals carry the assister that Sofascore left out", () => {
    const incidents = parseFlashscoreSummary(flash(`${TOUARGA_FUS}.summary`));
    const goals = incidents.filter((i) => i.kind === "goal");
    expect(goals.map((g) => [g.side, g.minute, g.player?.name, g.assist?.name])).toEqual([
      ["home", 12, "Ajerrar A.", "Kajai Y."],
      ["home", 28, "Lotfi S.", "Ait Lamkadem R."],
    ]);
  });

  test("a penalty is one penalty_goal, not a goal plus an awarded kick", () => {
    const incidents = parseFlashscoreSummary(flash(`${TOUARGA_FUS}.summary`));
    const penalties = incidents.filter((i) => i.kind === "penalty_goal");
    expect(penalties.map((p) => [p.side, p.minute, p.player?.name])).toEqual([
      ["away", 70, "Lahtimi M."],
    ]);
    expect(incidents.filter((i) => i.kind === "goal")).toHaveLength(2);
  });

  test("a missed penalty is read as one", () => {
    const incidents = parseFlashscoreSummary(flash(`${KACM_HUSA}.summary`));
    expect(incidents.filter((i) => i.kind === "penalty_missed")).toHaveLength(1);
  });

  test("added time and substitutions", () => {
    const incidents = parseFlashscoreSummary(flash(`${TOUARGA_FUS}.summary`));
    const late = incidents.find((i) => i.kind === "yellow_card" && i.minute === 90);
    expect(late?.addedMinutes).toBe(4);
    const subs = incidents.filter((i) => i.kind === "substitution");
    expect(subs.length).toBeGreaterThan(0);
    expect(subs.every((s) => s.playerIn !== null && s.playerOut !== null)).toBe(true);
    // One incoming player has no id in the real response.
    expect(subs.some((s) => s.playerIn?.externalId === null)).toBe(true);
  });

  test("a label not seen in Phase 0 is unknown, never guessed", () => {
    const [incident] = parseFlashscoreSummary({
      DATA: [
        {
          ITEMS: [
            {
              INCIDENT_TEAM: 1,
              INCIDENT_TIME: "30'",
              INCIDENT_PARTICIPANTS: [{ INCIDENT_TYPE: "RED_CARD", PARTICIPANT_NAME: "X Y." }],
            },
          ],
        },
      ],
    });
    expect(incident).toMatchObject({ kind: "unknown", rawType: "RED_CARD" });
  });

  test("lineups: sides, starters, shirt numbers, keeper marker; no names with markers", () => {
    const lineups = parseFlashscoreLineups(flash(`${TOUARGA_FUS}.lineups`));
    expect(lineups.fullCoverage).toBe(false);
    for (const side of ["home", "away"] as const) {
      const starters = lineups.players.filter((p) => p.side === side && p.starter);
      expect(starters).toHaveLength(11);
      expect(starters.filter((p) => p.position === "G")).toHaveLength(1);
      expect(starters.every((p) => p.shirtNumber !== null)).toBe(true);
    }
    expect(lineups.players.some((p) => /\((?:C|G)\)/.test(p.name))).toBe(false);
    expect(lineups.players.find((p) => p.name === "Ait Lamkadem R.")?.shirtNumber).toBe(21);
  });

  test("lineups: starters are found whichever group type the provider uses", () => {
    // KACM-HUSA sends its starters under group type 3 rather than 1.
    const lineups = parseFlashscoreLineups(flash(`${KACM_HUSA}.lineups`));
    expect(lineups.players.filter((p) => p.starter)).toHaveLength(22);
  });

  test("statistics: shots on target as numbers", () => {
    const lines = parseFlashscoreStatistics(flash(`${TOUARGA_FUS}.statistics`));
    const shots = lines.find((l) => l.period === "Match" && l.label === "Shots on target");
    expect([shots?.home, shots?.away]).toEqual([3, 4]);
  });

  test("a changed shape is rejected", () => {
    expect(() => parseFlashscoreData({ DATA: {} })).toThrow(FootballError);
  });
});
