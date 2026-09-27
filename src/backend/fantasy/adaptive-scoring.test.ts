import { describe, expect, it } from "bun:test";
import {
  chooseFixtureMode,
  deriveParticipation,
  readiness,
  scoreCertifiedPlayerFixture,
  SIMPLE_FIELDS,
  DETAIL_FIELDS,
  type FieldEvidence,
} from "./adaptive-scoring";
import { scorePlayerFixture, type ScoringRules, type PlayerFixtureStats } from "./scoring";
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
const evidence = () =>
  Object.fromEntries(
    [...SIMPLE_FIELDS, ...DETAIL_FIELDS].map((field) => [
      field,
      {
        state: "verified",
        source: "test",
        observedAt: "2026-09-27T00:00:00Z",
        references: ["test:fixture:1"],
      },
    ]),
  ) as FieldEvidence;
const total = (events: readonly { points: number }[]) => events.reduce((n, e) => n + e.points, 0);
describe("adaptive scoring", () => {
  it("preserves every full-mode total", () => {
    for (const position of ["GK", "DEF", "MID", "FWD"] as const)
      expect(
        scoreCertifiedPlayerFixture("p", "f", position, stats, evidence(), rules, "full"),
      ).toEqual(scorePlayerFixture("p", "f", position, stats, rules));
  });
  it("excludes all four detail categories even when values exist", () => {
    const events = scoreCertifiedPlayerFixture("p", "f", "GK", stats, evidence(), rules, "simple");
    expect(events.map((e) => e.category)).not.toContain("assist");
    expect(events).toHaveLength(8);
    expect(total(events)).toBe(8);
  });
  it("unknown values never certify zero and provisional scoring uses only certified categories", () => {
    const proof = evidence();
    delete proof.goals;
    delete proof.saves;
    expect(readiness(stats, proof, "GK")).toEqual({ simple: false, full: false });
    expect(
      scoreCertifiedPlayerFixture("p", "f", "GK", stats, proof, rules, null).map((e) => e.category),
    ).not.toContain("goal");
    const missing = evidence();
    missing.saves!.state = "unknown";
    expect(readiness({ ...stats, saves: 0 }, missing, "GK")).toEqual({ simple: true, full: false });
  });
  it("permits derived minutes only for simple readiness", () => {
    const proof = evidence();
    proof.minutes!.state = "derived";
    expect(readiness(stats, proof, "GK")).toEqual({ simple: true, full: false });
  });
  it("preserves 59/60-minute defensive thresholds", () => {
    const make = (minutes: number) =>
      scoreCertifiedPlayerFixture(
        "p",
        "f",
        "DEF",
        {
          ...stats,
          minutes,
          goals: 0,
          ownGoals: 0,
          yellowCards: 0,
          cleanSheet: true,
          goalsConceded: 0,
        },
        evidence(),
        rules,
        "simple",
      );
    expect(total(make(59))).toBe(1);
    expect(total(make(60))).toBe(6);
  });
  it("derives participation without adding stoppage minutes and refuses uncertain ordering", () => {
    const base = {
      complete: true,
      orderingVerified: true,
      started: true,
      appeared: true,
      enteredAt: null,
      exitedAt: 59,
      concededAt: [12],
    };
    expect(deriveParticipation(base)).toEqual({ minutes: 59, goalsConceded: 1, cleanSheet: false });
    expect(
      deriveParticipation({ ...base, started: false, enteredAt: 90, exitedAt: 90, concededAt: [] }),
    ).toEqual({ minutes: 1, goalsConceded: 0, cleanSheet: false });
    expect(() => deriveParticipation({ ...base, concededAt: [59] })).toThrow(
      "participation_event_order_ambiguous",
    );
    expect(() => deriveParticipation({ ...base, complete: false })).toThrow(
      "participation_unverified",
    );
  });
  it("locks the latest pre-cutoff snapshot, not late improvements", () => {
    const base = {
      now: "2026-09-27T12:00:00Z",
      cutoff: "2026-09-27T12:00:00Z",
      lockedMode: null,
      snapshots: [
        { observedAt: "2026-09-27T11:00:00Z", fullReady: false },
        { observedAt: "2026-09-27T12:01:00Z", fullReady: true },
      ],
    } as const;
    expect(chooseFixtureMode(base)).toBe("simple");
    expect(chooseFixtureMode({ ...base, now: "2026-09-27T11:59:59Z" })).toBeNull();
    expect(
      chooseFixtureMode({
        ...base,
        lockedMode: "simple",
        snapshots: [{ observedAt: "2026-09-27T11:00:00Z", fullReady: true }],
      }),
    ).toBe("simple");
    expect(
      chooseFixtureMode({ ...base, snapshots: [{ observedAt: base.cutoff, fullReady: true }] }),
    ).toBe("full");
  });
});
