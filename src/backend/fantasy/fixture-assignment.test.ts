import { describe, expect, it } from "bun:test";
import { resolveFixtureAssignment } from "./fixture-assignment";

const kickoff = new Date("2030-09-01T18:00:00Z");
const nextDeadline = new Date("2030-09-05T12:00:00Z");

describe("Fantasy exceptional fixture rules v1.0", () => {
  it("reassigns a pre-deadline postponement", () => {
    expect(
      resolveFixtureAssignment({
        state: "postponed",
        locked: false,
        competitionConfirmedResult: false,
        resumedFromSuspension: false,
        replayedFromBeginning: false,
        completedAt: null,
        originalKickoffAt: kickoff,
        nextGameweekDeadlineAt: nextDeadline,
        completionWindowHours: 48,
      }),
    ).toBe("reassign_before_lock");
  });

  it("keeps a post-lock fixture completed within 48 hours", () => {
    expect(
      resolveFixtureAssignment({
        state: "postponed",
        locked: true,
        competitionConfirmedResult: false,
        resumedFromSuspension: false,
        replayedFromBeginning: false,
        completedAt: new Date("2030-09-03T17:59:00Z"),
        originalKickoffAt: kickoff,
        nextGameweekDeadlineAt: nextDeadline,
        completionWindowHours: 48,
      }),
    ).toBe("keep_original_gameweek");
  });

  it("moves a late completion and voids a replay from the beginning", () => {
    const base = {
      state: "abandoned" as const,
      locked: true,
      competitionConfirmedResult: false,
      resumedFromSuspension: false,
      originalKickoffAt: kickoff,
      nextGameweekDeadlineAt: nextDeadline,
      completionWindowHours: 48,
    };
    expect(
      resolveFixtureAssignment({
        ...base,
        replayedFromBeginning: false,
        completedAt: new Date("2030-09-04T18:00:00Z"),
      }),
    ).toBe("move_to_actual_gameweek");
    expect(
      resolveFixtureAssignment({ ...base, replayedFromBeginning: true, completedAt: null }),
    ).toBe("void_and_replay_later");
  });

  it("keeps unresolved fixtures provisional", () => {
    expect(
      resolveFixtureAssignment({
        state: "suspended",
        locked: true,
        competitionConfirmedResult: false,
        resumedFromSuspension: false,
        replayedFromBeginning: false,
        completedAt: null,
        originalKickoffAt: kickoff,
        nextGameweekDeadlineAt: nextDeadline,
        completionWindowHours: 48,
      }),
    ).toBe("remain_provisional");
  });
});
