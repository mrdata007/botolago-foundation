import { describe, expect, test } from "bun:test";
import {
  droppedFields,
  FLASHSCORE_SPEC,
  SOFASCORE_SPEC,
  summarizeFlashscore,
  summarizeSofascore,
  trim,
  trimSofascoreStatistics,
} from "./provider-fixtures";

// Synthetic data only: nothing here comes from a provider.
const lineups = {
  confirmed: true,
  home: {
    formation: "4-3-3",
    supportStaff: [],
    playerColor: { primary: "#000" },
    players: [
      {
        player: {
          id: 1,
          name: "Player One",
          shortName: "P. One",
          position: "G",
          jerseyNumber: "1",
          height: 190,
          dateOfBirthTimestamp: 1,
          country: { name: "Nowhere" },
          proposedMarketValueRaw: { value: 1 },
        },
        teamId: 10,
        shirtNumber: 1,
        position: "G",
        substitute: false,
        statistics: { minutesPlayed: 90, saves: 3, goals: 0, touches: 40, expectedGoals: 0.1 },
      },
    ],
  },
  away: { players: [] },
};

describe("trim", () => {
  test("keeps only the listed fields, through lists and nested objects", () => {
    const out = trim(lineups, SOFASCORE_SPEC.lineups) as typeof lineups;
    expect(out.home.players[0]?.statistics).toEqual({ minutesPlayed: 90, saves: 3, goals: 0 });
    expect(out.home.players[0]?.player).toEqual({
      id: 1,
      name: "Player One",
      shortName: "P. One",
      position: "G",
      jerseyNumber: "1",
    });
    expect(JSON.stringify(out)).not.toContain("Nowhere");
    expect(JSON.stringify(out)).not.toContain("dateOfBirth");
    expect(out.home).not.toHaveProperty("playerColor");
  });

  test("leaves a missing field missing: no invented zero", () => {
    const out = trim(
      { players: [{ statistics: { minutesPlayed: 5 } }] },
      {
        players: { statistics: { minutesPlayed: true, saves: true } },
      },
    ) as { players: { statistics: Record<string, number> }[] };
    expect(out.players[0]?.statistics).toEqual({ minutesPlayed: 5 });
    expect(out.players[0]?.statistics).not.toHaveProperty("saves");
  });
});

describe("droppedFields", () => {
  test("names the dropped fields without their values", () => {
    const names = droppedFields(lineups, SOFASCORE_SPEC.lineups);
    expect(names).toContain("$.home.players[].player.height");
    expect(names).toContain("$.home.players[].statistics.touches");
    expect(names).toContain("$.home.playerColor");
    expect(names.join(" ")).not.toContain("Nowhere");
  });
});

describe("trimSofascoreStatistics", () => {
  const raw = {
    statistics: [
      {
        period: "ALL",
        groups: [
          {
            groupName: "Shots",
            statisticsItems: [
              { key: "shotsOnGoal", name: "Shots on target", homeValue: 3, awayValue: 4, extra: 1 },
              { key: "ballPossession", name: "Ball possession", homeValue: 42, awayValue: 58 },
            ],
          },
        ],
      },
    ],
  };

  test("keeps the shots-on-target and saves lines and drops the rest", () => {
    const out = trimSofascoreStatistics(raw) as typeof raw;
    const items = out.statistics[0]?.groups[0]?.statisticsItems;
    expect(items).toEqual([
      { key: "shotsOnGoal", name: "Shots on target", homeValue: 3, awayValue: 4 },
    ]);
  });

  test("copes with a match that has no statistics", () => {
    expect(trimSofascoreStatistics({})).toEqual({ statistics: [] });
  });
});

describe("the Flashscore keep-lists", () => {
  test("drop referee, venue and bookmaker data", () => {
    const summary = {
      DATA: [{ STAGE_NAME: "1st Half", ITEMS: [{ INCIDENT_ID: "1", INCIDENT_TEAM: 1 }] }],
      INFO: { REFEREE: "Someone", VENUE: "Somewhere" },
      LAST_CHANGE_KEY: null,
    };
    const out = trim(summary, FLASHSCORE_SPEC.summary);
    expect(JSON.stringify(out)).not.toContain("Someone");
    expect(out).toEqual({
      DATA: [{ STAGE_NAME: "1st Half", ITEMS: [{ INCIDENT_ID: "1", INCIDENT_TEAM: 1 }] }],
    });
  });
});

describe("summaries print counts and labels, never names", () => {
  test("Sofascore: tells limited coverage from full and counts goals with assists", () => {
    const limited = summarizeSofascore({
      lineups: {
        home: { players: [{ statistics: { minutesPlayed: 90, goals: 1, goalAssist: 0 } }] },
      },
      incidents: {
        incidents: [
          { incidentType: "goal", incidentClass: "regular", player: { name: "Hidden Name" } },
          { incidentType: "card", incidentClass: "yellow" },
        ],
      },
      statistics: {},
    });
    expect(limited.fullCoverage).toBe(false);
    expect(limited.goalsInIncidents).toBe(1);
    expect(limited.goalsWithAssistInIncidents).toBe(0);
    expect(limited.incidents).toEqual({ "card/yellow": 1, "goal/regular": 1 });
    expect(JSON.stringify(limited)).not.toContain("Hidden Name");

    const full = summarizeSofascore({
      lineups: {
        away: { players: [{ statistics: { totalPass: 9, rating: 7, saves: 2, goalAssist: 1 } }] },
      },
      incidents: { incidents: [{ incidentType: "goal", assist1: { name: "X" } }] },
      statistics: {
        statistics: [{ groups: [{ statisticsItems: [{ key: "shotsOnGoal" }, { key: "fouls" }] }] }],
      },
    });
    expect(full.fullCoverage).toBe(true);
    expect(full.keepersWithSaves).toBe(1);
    expect(full.goalsWithAssistInIncidents).toBe(1);
    expect(full.teamStatKeys).toEqual(["shotsOnGoal"]);
  });

  test("Flashscore: incident type labels and shots on target", () => {
    const out = summarizeFlashscore({
      data: { DATA: { EVENT: { HOME_SCORE_FULL: 2, AWAY_SCORE_FULL: 1 } } },
      summary: {
        DATA: [
          {
            ITEMS: [
              {
                INCIDENT_PARTICIPANTS: [{ INCIDENT_TYPE: "GOAL" }, { INCIDENT_TYPE: "ASSISTANCE" }],
              },
              { INCIDENT_PARTICIPANTS: [{ INCIDENT_TYPE: "PENALTY_SCORED" }] },
            ],
          },
        ],
      },
      statistics: {
        DATA: [
          {
            STAGE_NAME: "Match",
            GROUPS: [
              { ITEMS: [{ INCIDENT_NAME: "Shots on target", VALUE_HOME: "3", VALUE_AWAY: "4" }] },
            ],
          },
        ],
      },
    });
    expect(out).toEqual({
      score: [2, 1],
      incidentTypes: { ASSISTANCE: 1, GOAL: 1, PENALTY_SCORED: 1 },
      shotsOnTarget: ["3", "4"],
    });
  });

  test("Flashscore: no statistics gives null, not a zero", () => {
    expect(summarizeFlashscore({ data: {}, summary: {}, statistics: {} }).shotsOnTarget).toBeNull();
  });
});
