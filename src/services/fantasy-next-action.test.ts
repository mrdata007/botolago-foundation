import { describe, expect, test } from "bun:test";

import { fantasyNextAction, type FantasyNextActionInput } from "./fantasy-next-action";

const NOW = Date.parse("2026-10-04T12:00:00Z");
const PAST = "2026-10-03T12:00:00Z";
const FUTURE = "2026-10-06T18:00:00Z";
const LATER = "2026-10-13T18:00:00Z";

const ready = (canCreate: boolean) => ({ kind: "ready", canCreate }) as const;

function run(input: Partial<FantasyNextActionInput>) {
  return fantasyNextAction({
    availability: ready(true),
    hasTeam: false,
    gameweek: null,
    now: NOW,
    ...input,
  });
}

describe("fantasyNextAction — no team", () => {
  test("enrolment open: create, with the enrolment deadline", () => {
    const action = run({
      gameweek: {
        number: 7,
        deadline: PAST,
        status: "locked",
        enrolment: { id: "x", number: 8, deadline: FUTURE },
      },
    });
    expect(action).toEqual({
      kind: "create",
      to: "/fantasy/create",
      deadline: { number: 8, at: FUTURE },
    });
  });

  test("enrolment open but no known deadline: create without a fabricated one", () => {
    expect(run({})).toEqual({ kind: "create", to: "/fantasy/create", deadline: null });
  });

  test("entries closed, no gameweek or season closed: explore players, never create", () => {
    for (const availability of [
      ready(false),
      { kind: "awaiting_gameweek" } as const,
      { kind: "season_closed" } as const,
    ]) {
      expect(run({ availability })).toEqual({
        kind: "explore",
        to: "/fantasy/players",
        deadline: null,
      });
    }
  });

  test("a failed probe is retry, not closed; loading is pending", () => {
    expect(run({ availability: { kind: "error", error: new Error("x") } })).toEqual({
      kind: "retry",
    });
    expect(run({ availability: { kind: "loading" } })).toEqual({ kind: "pending" });
  });
});

describe("fantasyNextAction — team ownership unknown", () => {
  test("loading ownership is pending, a failed ownership read is retry", () => {
    expect(run({ hasTeam: undefined })).toEqual({ kind: "pending" });
    expect(run({ hasTeam: null })).toEqual({ kind: "retry" });
  });
});

describe("fantasyNextAction — owner", () => {
  const gw = (status: NonNullable<FantasyNextActionInput["gameweek"]>["status"], extra = {}) => ({
    number: 7,
    deadline: FUTURE,
    status,
    ...extra,
  });

  test("editable team before the deadline: prepare, with that deadline", () => {
    expect(run({ hasTeam: true, gameweek: gw("open") })).toEqual({
      kind: "prepare",
      to: "/fantasy/team",
      deadline: { number: 7, at: FUTURE },
    });
  });

  test("locked before points: view team", () => {
    expect(run({ hasTeam: true, gameweek: gw("locked", { deadline: PAST }) }).kind).toBe(
      "view_team",
    );
  });

  test("live, provisional or finalizing: follow points", () => {
    for (const status of ["live", "provisional", "finalizing"] as const) {
      expect(run({ hasTeam: true, gameweek: gw(status, { deadline: PAST }) })).toEqual({
        kind: "follow_points",
        to: "/fantasy/points",
        deadline: null,
      });
    }
  });

  test("final without a next round: view result", () => {
    for (const status of ["finalized", "corrected"] as const) {
      expect(
        run({ hasTeam: true, gameweek: gw(status, { deadline: PAST, enrolment: null }) }).kind,
      ).toBe("view_result");
    }
  });

  test("final with the next round already staged: still the result, never a locked editor", () => {
    // The team editor follows the current gameweek, whose deadline has passed;
    // it only unlocks once the lifecycle makes the next round current.
    for (const deadline of [LATER, PAST]) {
      expect(
        run({
          hasTeam: true,
          availability: ready(true),
          gameweek: gw("finalized", {
            deadline: PAST,
            enrolment: { id: "n", number: 8, deadline },
          }),
        }),
      ).toEqual({ kind: "view_result", to: "/fantasy/points", deadline: null });
    }
  });

  test("closed season: results; no gameweek: view team", () => {
    expect(run({ hasTeam: true, availability: { kind: "season_closed" } }).kind).toBe("results");
    expect(run({ hasTeam: true, gameweek: null }).kind).toBe("view_team");
  });

  test("an owner never gets create, whatever enrolment says", () => {
    for (const status of [
      "scheduled",
      "open",
      "locked",
      "live",
      "provisional",
      "finalizing",
      "finalized",
      "corrected",
      "cancelled",
    ] as const) {
      expect(run({ hasTeam: true, gameweek: gw(status) }).kind).not.toBe("create");
    }
  });
});
