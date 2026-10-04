import { describe, expect, test } from "bun:test";

import type { MatchStatus } from "@/types/domain";
import { predictionFollowsTabs } from "./match-layout";

describe("predictionFollowsTabs", () => {
  test("the prediction leads before kickoff, while it can still be made", () => {
    expect(predictionFollowsTabs("scheduled")).toBe(false);
  });

  test("the tabs lead once the match is live or finished", () => {
    expect(predictionFollowsTabs("live")).toBe(true);
    expect(predictionFollowsTabs("finished")).toBe(true);
  });

  test("a postponed match has not been played, so it keeps the pre-kickoff order", () => {
    expect(predictionFollowsTabs("postponed")).toBe(false);
  });

  test("every status is decided, so a new one cannot slip through unanswered", () => {
    const all: Record<MatchStatus, boolean> = {
      scheduled: false,
      live: true,
      finished: true,
      postponed: false,
    };
    for (const [status, expected] of Object.entries(all)) {
      expect(predictionFollowsTabs(status as MatchStatus)).toBe(expected);
    }
  });
});
