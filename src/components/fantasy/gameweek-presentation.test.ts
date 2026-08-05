import { describe, expect, test } from "bun:test";

import { getGameweekPresentation } from "./gameweek-presentation";

describe("gameweek presentation", () => {
  test("keeps deadline countdowns only before the lock", () => {
    expect(getGameweekPresentation("scheduled", "provisional").showCountdown).toBe(true);
    expect(getGameweekPresentation("open", "provisional").showCountdown).toBe(true);
    expect(getGameweekPresentation("locked", "provisional").showCountdown).toBe(false);
  });

  test("routes live and final states to points", () => {
    for (const status of ["live", "provisional", "finalizing", "finalized", "corrected"] as const) {
      expect(getGameweekPresentation(status, "provisional").pointsRoute).toBe(true);
    }
  });

  test("polls only while points can still change", () => {
    expect(getGameweekPresentation("live", "provisional").pollIntervalMs).toBe(30_000);
    expect(getGameweekPresentation("live", "final").pollIntervalMs).toBe(false);
    expect(getGameweekPresentation("finalized", "final").pollIntervalMs).toBe(false);
  });

  test("gives cancelled gameweeks an honest neutral state", () => {
    const presentation = getGameweekPresentation("cancelled", "final");
    expect(presentation.badgeKey).toBe("fantasy.gameweek.status.cancelled");
    expect(presentation.pointsRoute).toBe(false);
  });
});
