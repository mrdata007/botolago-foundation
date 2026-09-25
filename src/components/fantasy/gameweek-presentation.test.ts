import { describe, expect, test } from "bun:test";

import { getGameweekPresentation, nextDeadlineAfter } from "./gameweek-presentation";

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

describe("the next deadline after a gameweek's", () => {
  // Production on 2026-09-24: GW1's deadline passed at 13:30 UTC; GW2 was staged.
  const gw1 = {
    number: 1,
    deadline: "2026-09-24T13:30:00Z",
    enrolment: { id: "gw2", number: 2, deadline: "2026-10-02T14:30:00Z" },
  };
  const at = (iso: string) => Date.parse(iso);

  test("is the next gameweek's once the current deadline has passed", () => {
    expect(nextDeadlineAfter(gw1, at("2026-09-24T21:24:00Z"))).toEqual({
      number: 2,
      deadline: "2026-10-02T14:30:00Z",
    });
  });

  test("is not shown before the current deadline", () => {
    expect(nextDeadlineAfter(gw1, at("2026-09-24T13:29:59Z"))).toBeNull();
  });

  test("is not shown once the next deadline has passed too", () => {
    expect(nextDeadlineAfter(gw1, at("2026-10-02T14:30:00Z"))).toBeNull();
  });

  test("is not shown without a next gameweek, or when it is the same one", () => {
    expect(nextDeadlineAfter({ ...gw1, enrolment: null }, at("2026-09-25T00:00:00Z"))).toBeNull();
    expect(
      nextDeadlineAfter({ ...gw1, enrolment: undefined }, at("2026-09-25T00:00:00Z")),
    ).toBeNull();
    expect(
      nextDeadlineAfter(
        { ...gw1, enrolment: { id: "gw1", number: 1, deadline: gw1.deadline } },
        at("2026-09-25T00:00:00Z"),
      ),
    ).toBeNull();
  });
});
