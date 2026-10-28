import { describe, expect, test } from "bun:test";

import {
  deadlineHeadline,
  getGameweekPresentation,
  nextDeadlineAfter,
} from "./gameweek-presentation";

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

describe("the deadline the hub card leads with", () => {
  // Production on 2026-10-28: round 5's deadline passed on Saturday 24 October
  // 14:30; round 6 is staged with its deadline on Friday 30 October 17:30.
  const J5 = "2026-10-24T14:30:00Z";
  const J6 = "2026-10-30T17:30:00Z";
  const gw5 = {
    number: 5,
    deadline: J5,
    status: "live" as const,
    enrolment: { id: "gw6", number: 6, deadline: J6 },
  };
  const at = (iso: string) => Date.parse(iso);

  test("before the deadline it is the round's own, with no sub-line", () => {
    const headline = deadlineHeadline({
      gameweek: { ...gw5, status: "open" },
      now: at("2026-10-23T10:00:00Z"),
      liveRounds: [],
    });
    expect(headline).toEqual({
      state: "open",
      lead: { number: 5, deadline: J5 },
      current: null,
      live: false,
    });
  });

  test("a live match never shows before the deadline", () => {
    const headline = deadlineHeadline({
      gameweek: { ...gw5, status: "open" },
      now: at("2026-10-23T10:00:00Z"),
      liveRounds: [5],
    });
    expect(headline.live).toBe(false);
  });

  test("past the deadline with matches still to play, the next round leads", () => {
    const headline = deadlineHeadline({
      gameweek: { ...gw5, status: "locked" },
      now: at("2026-10-28T16:00:00Z"),
      liveRounds: [],
    });
    expect(headline).toEqual({
      state: "next_open",
      lead: { number: 6, deadline: J6 },
      current: { number: 5, phase: "in_progress" },
      live: false,
    });
  });

  test("the lead is the server's date, untouched", () => {
    const headline = deadlineHeadline({
      gameweek: gw5,
      now: at("2026-10-28T16:00:00Z"),
      liveRounds: null,
    });
    expect(headline.lead?.deadline).toBe(J6);
  });

  test("the live dot needs a match of this round in play", () => {
    const now = at("2026-10-28T16:00:00Z");
    expect(deadlineHeadline({ gameweek: gw5, now, liveRounds: [5] }).live).toBe(true);
    expect(deadlineHeadline({ gameweek: gw5, now, liveRounds: [4, 5, 6] }).live).toBe(true);
    // The round status says "live" but nothing is being played.
    expect(deadlineHeadline({ gameweek: gw5, now, liveRounds: [] }).live).toBe(false);
    // The live list has not loaded, or failed: unknown is not a dot.
    expect(deadlineHeadline({ gameweek: gw5, now, liveRounds: null }).live).toBe(false);
    // A match of another round only.
    expect(deadlineHeadline({ gameweek: gw5, now, liveRounds: [3] }).live).toBe(false);
    // A match with no round number counts.
    expect(deadlineHeadline({ gameweek: gw5, now, liveRounds: [0] }).live).toBe(true);
  });

  test("a finished round is not live and reads as finished", () => {
    const headline = deadlineHeadline({
      gameweek: { ...gw5, status: "finalized" },
      now: at("2026-10-28T16:00:00Z"),
      liveRounds: [5],
    });
    expect(headline.state).toBe("next_open");
    expect(headline.current).toEqual({ number: 5, phase: "finished" });
    expect(headline.live).toBe(false);
  });

  test("a cancelled round reads as cancelled", () => {
    const headline = deadlineHeadline({
      gameweek: { ...gw5, status: "cancelled" },
      now: at("2026-10-28T16:00:00Z"),
      liveRounds: [],
    });
    expect(headline.current).toEqual({ number: 5, phase: "cancelled" });
  });

  test("with no next round published the card says so and shows no date", () => {
    for (const enrolment of [null, undefined]) {
      const headline = deadlineHeadline({
        gameweek: { ...gw5, enrolment },
        now: at("2026-10-28T16:00:00Z"),
        liveRounds: [5],
      });
      expect(headline).toEqual({
        state: "awaiting_next",
        lead: null,
        current: { number: 5, phase: "in_progress" },
        live: true,
      });
    }
  });

  test("a next round whose deadline has passed too is not offered", () => {
    const headline = deadlineHeadline({
      gameweek: gw5,
      now: at("2026-10-30T17:30:00Z"),
      liveRounds: [],
    });
    expect(headline.state).toBe("awaiting_next");
    expect(headline.lead).toBeNull();
  });

  test("a next round that is the same round, or an earlier one, is not offered", () => {
    const now = at("2026-10-28T16:00:00Z");
    for (const number of [5, 4]) {
      const headline = deadlineHeadline({
        gameweek: { ...gw5, enrolment: { id: "x", number, deadline: J6 } },
        now,
        liveRounds: [],
      });
      expect(headline.state).toBe("awaiting_next");
    }
  });

  test("the server's lock is believed over a device clock that runs behind", () => {
    const headline = deadlineHeadline({
      gameweek: { ...gw5, status: "locked" },
      now: at("2026-10-24T13:00:00Z"),
      liveRounds: [],
    });
    expect(headline.state).toBe("next_open");
  });

  test("without a status (mock mode) the date alone decides", () => {
    const base = { number: 5, deadline: J5, enrolment: gw5.enrolment };
    expect(
      deadlineHeadline({ gameweek: base, now: at("2026-10-24T14:29:59Z"), liveRounds: [] }).state,
    ).toBe("open");
    expect(
      deadlineHeadline({ gameweek: base, now: at("2026-10-24T14:30:00Z"), liveRounds: [] }).state,
    ).toBe("next_open");
  });
});
