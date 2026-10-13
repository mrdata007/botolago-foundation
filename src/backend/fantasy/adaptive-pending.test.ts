import { describe, expect, it } from "bun:test";
import {
  DETAIL_FIELDS,
  SIMPLE_FIELDS,
  pendingCategories,
  scoreCertifiedPlayerFixture,
  type FieldEvidence,
} from "./adaptive-scoring";
import type { PlayerFixtureStats, ScoringRules } from "./scoring";

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
const stats: PlayerFixtureStats = {
  minutes: 90,
  goals: 1,
  assists: 2,
  cleanSheet: false,
  goalsConceded: 3,
  saves: 8,
  penaltiesSaved: 1,
  penaltiesMissed: 1,
  yellowCards: 1,
  redCards: 0,
  secondYellowDismissals: 0,
  ownGoals: 1,
  bonus: 0,
  playerOfMatchPoints: 0,
};
const verified = {
  state: "verified",
  source: "test",
  observedAt: "2026-10-13T00:00:00Z",
  references: ["test:fixture:1"],
};
const evidence = (...unknownFields: string[]) =>
  Object.fromEntries(
    [...SIMPLE_FIELDS, ...DETAIL_FIELDS].map((field) => [
      field,
      unknownFields.includes(field)
        ? { state: "unknown", source: "sofascore", observedAt: verified.observedAt, references: [] }
        : verified,
    ]),
  ) as FieldEvidence;
const without = (...fields: string[]) =>
  Object.fromEntries(Object.entries(stats).filter(([key]) => !fields.includes(key)));
const categories = (events: readonly { category: string }[]) =>
  events.map((e) => e.category).sort();

describe("pending categories (C3)", () => {
  it("a pending clean sheet emits nothing for it and nothing is turned into a zero", () => {
    const proof = evidence("cleanSheet");
    const row = without("cleanSheet");
    expect(pendingCategories(row, proof, 60, "full")).toEqual(["clean_sheet"]);
    const events = scoreCertifiedPlayerFixture("p", "f", "DEF", row, proof, rules, "full");
    expect(categories(events)).not.toContain("clean_sheet");
    expect(categories(events)).toContain("goals_conceded");
  });

  it("unknown minutes make appearance, clean_sheet and goals_conceded pending", () => {
    expect(pendingCategories(without("minutes"), evidence("minutes"), 60, "full")).toEqual([
      "appearance",
      "clean_sheet",
      "goals_conceded",
    ]);
  });

  it("under the full-appearance minutes unknown clean sheet and goals conceded decide nothing", () => {
    const proof = evidence("cleanSheet", "goalsConceded");
    const row = { ...without("cleanSheet", "goalsConceded"), minutes: 30 };
    expect(pendingCategories(row, proof, 60, "full")).toEqual([]);
    const events = scoreCertifiedPlayerFixture("p", "f", "GK", row, proof, rules, "full");
    expect(events.find((e) => e.category === "clean_sheet")?.points).toBe(0);
    expect(events.find((e) => e.category === "goals_conceded")?.points).toBe(0);
    expect(events.find((e) => e.category === "appearance")?.points).toBe(1);
  });

  it("at exactly the full-appearance minutes the unknown fields are pending", () => {
    const proof = evidence("cleanSheet", "goalsConceded");
    const row = { ...without("cleanSheet", "goalsConceded"), minutes: 60 };
    expect(pendingCategories(row, proof, 60, "full")).toEqual(["clean_sheet", "goals_conceded"]);
  });

  it("a minutes straddle keeps the confirmed short appearance; the rest waits", () => {
    const proof = evidence("cleanSheet", "goalsConceded");
    const row = { ...without("cleanSheet", "goalsConceded"), minutes: 45 };
    const items = [{ category: "appearance", reason: "minutes_conflict" }];
    expect(pendingCategories(row, proof, 60, "full", items)).toEqual([
      "appearance",
      "clean_sheet",
      "goals_conceded",
    ]);
    const events = scoreCertifiedPlayerFixture("p", "f", "GK", row, proof, rules, "full", items);
    expect(events.find((e) => e.category === "appearance")?.points).toBe(1);
    expect(categories(events)).not.toContain("clean_sheet");
    expect(categories(events)).not.toContain("goals_conceded");
  });

  it("simple mode's excluded categories are not pending", () => {
    const proof = evidence("assists", "saves");
    const row = without("assists", "saves");
    expect(pendingCategories(row, proof, 60, "simple")).toEqual([]);
    expect(pendingCategories(row, proof, 60, "full")).toEqual(["assist", "saves"]);
  });
});
