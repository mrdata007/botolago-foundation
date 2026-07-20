import type { FixtureStatus } from "../contracts";

export interface LiveSchedulingInput {
  readonly kickoffAt: string;
  readonly status: FixtureStatus;
  readonly finalizedAt: string | null;
}

export interface LiveSchedulingDecision {
  readonly eligible: boolean;
  readonly nextPollInMs: number | null;
  readonly reason:
    | "pre_kickoff"
    | "live"
    | "delayed"
    | "suspended"
    | "correction_window"
    | "terminal"
    | "too_early";
}

export function liveSchedulingDecision(
  fixture: LiveSchedulingInput,
  nowMs: number = Date.now(),
): LiveSchedulingDecision {
  const kickoffMs = Date.parse(fixture.kickoffAt);
  if (!Number.isFinite(kickoffMs))
    return { eligible: false, nextPollInMs: null, reason: "terminal" };
  if (["cancelled", "abandoned"].includes(fixture.status)) {
    return { eligible: false, nextPollInMs: null, reason: "terminal" };
  }
  if (fixture.status === "finished") {
    const finalizedMs = fixture.finalizedAt ? Date.parse(fixture.finalizedAt) : nowMs;
    const withinCorrectionWindow = nowMs - finalizedMs < 15 * 60_000;
    return withinCorrectionWindow
      ? { eligible: true, nextPollInMs: 5 * 60_000, reason: "correction_window" }
      : { eligible: false, nextPollInMs: null, reason: "terminal" };
  }
  if (fixture.status === "suspended") {
    return { eligible: true, nextPollInMs: 5 * 60_000, reason: "suspended" };
  }
  if (fixture.status === "delayed") {
    return { eligible: true, nextPollInMs: 60_000, reason: "delayed" };
  }
  if (
    ["live_first_half", "half_time", "live_second_half", "extra_time", "penalties"].includes(
      fixture.status,
    )
  ) {
    return { eligible: true, nextPollInMs: 15_000, reason: "live" };
  }
  const untilKickoff = kickoffMs - nowMs;
  if (untilKickoff > 6 * 60 * 60_000)
    return { eligible: false, nextPollInMs: null, reason: "too_early" };
  if (untilKickoff > 60 * 60_000)
    return { eligible: true, nextPollInMs: 15 * 60_000, reason: "pre_kickoff" };
  if (untilKickoff > 10 * 60_000)
    return { eligible: true, nextPollInMs: 5 * 60_000, reason: "pre_kickoff" };
  return { eligible: true, nextPollInMs: 30_000, reason: "pre_kickoff" };
}
