import { describe, expect, it } from "bun:test";
import { applyLineupMultiplier, scorePlayerFixture, type ScoringRules } from "./scoring";

const rules: ScoringRules = {
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
};

describe("Fantasy scoring", () => {
  it("emits explainable deterministic category events", () => {
    const events = scorePlayerFixture(
      "player",
      "fixture",
      "GK",
      {
        minutes: 90,
        goals: 0,
        assists: 1,
        cleanSheet: false,
        goalsConceded: 2,
        saves: 7,
        penaltiesSaved: 1,
        penaltiesMissed: 0,
        yellowCards: 1,
        redCards: 0,
        secondYellowDismissals: 0,
        ownGoals: 0,
        bonus: 2,
        playerOfMatchPoints: 3,
      },
      rules,
    );
    expect(Object.fromEntries(events.map((event) => [event.category, event.points]))).toEqual({
      appearance: 2,
      assist: 3,
      goals_conceded: -1,
      saves: 2,
      penalty_save: 5,
      yellow_card: -1,
    });
    expect(new Set(events.map((event) => event.sourceKey)).size).toBe(events.length);
  });

  it("uses position-specific goal and clean-sheet rules", () => {
    const base = {
      minutes: 90,
      goals: 1,
      assists: 0,
      cleanSheet: true,
      goalsConceded: 0,
      saves: 0,
      penaltiesSaved: 0,
      penaltiesMissed: 0,
      yellowCards: 0,
      redCards: 0,
      secondYellowDismissals: 0,
      ownGoals: 0,
      bonus: 0,
      playerOfMatchPoints: 0,
    };
    const defender = scorePlayerFixture("p", "f", "DEF", base, rules).reduce(
      (sum, event) => sum + event.points,
      0,
    );
    const forward = scorePlayerFixture("p", "f", "FWD", base, rules).reduce(
      (sum, event) => sum + event.points,
      0,
    );
    expect(defender).toBe(12);
    expect(forward).toBe(6);
  });

  it("awards ten goalkeeper goal points and disables unpublished categories", () => {
    const events = scorePlayerFixture(
      "goalkeeper",
      "fixture",
      "GK",
      {
        minutes: 90,
        goals: 1,
        assists: 0,
        cleanSheet: false,
        goalsConceded: 0,
        saves: 0,
        penaltiesSaved: 0,
        penaltiesMissed: 0,
        yellowCards: 0,
        redCards: 0,
        secondYellowDismissals: 0,
        ownGoals: 0,
        bonus: 3,
        playerOfMatchPoints: 5,
      },
      rules,
    );
    expect(events.find((event) => event.category === "goal")?.points).toBe(10);
    expect(events.some((event) => event.category === "bonus")).toBeFalse();
    expect(events.some((event) => event.category === "player_of_match")).toBeFalse();
  });

  it("scores a second-yellow dismissal as minus three total", () => {
    const events = scorePlayerFixture(
      "player",
      "fixture",
      "MID",
      {
        minutes: 70,
        goals: 0,
        assists: 0,
        cleanSheet: false,
        goalsConceded: 0,
        saves: 0,
        penaltiesSaved: 0,
        penaltiesMissed: 0,
        yellowCards: 0,
        redCards: 0,
        secondYellowDismissals: 1,
        ownGoals: 0,
        bonus: 0,
        playerOfMatchPoints: 0,
      },
      rules,
    );
    expect(events.filter((event) => event.category.includes("yellow"))).toEqual([
      expect.objectContaining({ category: "second_yellow_dismissal", points: -3 }),
    ]);
  });

  it("applies captain and triple-captain multipliers", () => {
    expect(applyLineupMultiplier(8, 2)).toBe(16);
    expect(applyLineupMultiplier(8, 3)).toBe(24);
  });
});
