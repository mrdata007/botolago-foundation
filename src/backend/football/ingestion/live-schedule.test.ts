import { describe, expect, test } from "bun:test";
import { liveSchedulingDecision } from "./live-schedule";

const now = Date.parse("2030-01-01T18:00:00.000Z");

describe("live scheduling strategy", () => {
  test("increases cadence near kickoff and during live play", () => {
    expect(
      liveSchedulingDecision(
        { kickoffAt: "2030-01-01T18:05:00.000Z", status: "scheduled", finalizedAt: null },
        now,
      ).nextPollInMs,
    ).toBe(30_000);
    expect(
      liveSchedulingDecision(
        { kickoffAt: "2030-01-01T17:00:00.000Z", status: "live_first_half", finalizedAt: null },
        now,
      ).nextPollInMs,
    ).toBe(15_000);
  });

  test("reduces suspended cadence and stops terminal polling", () => {
    expect(
      liveSchedulingDecision(
        { kickoffAt: "2030-01-01T17:00:00.000Z", status: "suspended", finalizedAt: null },
        now,
      ),
    ).toMatchObject({ eligible: true, reason: "suspended", nextPollInMs: 300_000 });
    expect(
      liveSchedulingDecision(
        { kickoffAt: "2030-01-01T17:00:00.000Z", status: "abandoned", finalizedAt: null },
        now,
      ),
    ).toEqual({ eligible: false, reason: "terminal", nextPollInMs: null });
  });
});
