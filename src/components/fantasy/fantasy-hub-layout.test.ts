import { describe, expect, test } from "bun:test";

import { deadlineCountdown } from "@/components/fpl/deadline";
import type { FantasyScreenPhase } from "@/components/fpl/useFantasyScreen";
import type { AuthStatus } from "@/services/auth-types";
import type { FantasyDataSource } from "@/services/fantasy-data-source";
import { fantasyHubLayout, joinDeadlineToShow, joinTarget } from "./fantasy-hub-layout";

/**
 * Audit 2026-09-25 (A16): a visitor without a team gets the first-time
 * proposition and none of the owner's personal sections, at any moment of
 * the page's life; an owner gets the dashboard as before; nobody gets the
 * prize dialog stacked on the proposition. What each layout renders is
 * `FantasyHubPersonal.test.tsx`.
 */

const PHASES: FantasyScreenPhase[] = [
  "loading",
  "season_closed",
  "awaiting_gameweek",
  "error",
  "guest",
  "no_team",
  "ready",
];

const layout = (
  authStatus: AuthStatus,
  phase: FantasyScreenPhase,
  hasTeam: boolean,
  source: FantasyDataSource = authStatus === "authenticated" ? "cloud" : "guest",
) => fantasyHubLayout({ authStatus, source, phase, hasTeam });

describe("fantasyHubLayout", () => {
  test("an owner with a ready screen gets the dashboard and the prize welcome, no proposition", () => {
    expect(layout("authenticated", "ready", true)).toEqual({
      audience: "owner",
      intro: null,
      dashboard: "show",
      prizeWelcome: true,
    });
  });

  test("the local (mock) source is an owner too once signed in", () => {
    expect(layout("authenticated", "ready", true, "local").audience).toBe("owner");
  });

  test("signed in without a team: the proposition, no leagues, no reminders, no dialog", () => {
    expect(layout("authenticated", "ready", false)).toEqual({
      audience: "no_team",
      intro: "no_team",
      dashboard: "none",
      prizeWelcome: false,
    });
  });

  test.each(["anonymous", "guest"] as const)(
    "signed out (%s): the proposition once the screen is ready, never the dashboard",
    (status) => {
      expect(layout(status, "ready", false)).toEqual({
        audience: "signed_out",
        intro: "signed_out",
        dashboard: "none",
        prizeWelcome: false,
      });
    },
  );

  test("a device guest is signed out even with a stale team in hand", () => {
    // `source === "guest"` is what the owned-data layer says; a team object
    // left from another session must not reopen the dashboard.
    expect(layout("anonymous", "ready", true)).toMatchObject({
      audience: "signed_out",
      dashboard: "none",
      prizeWelcome: false,
    });
    expect(layout("authenticated", "ready", true, "guest")).toMatchObject({
      audience: "signed_out",
      dashboard: "none",
      prizeWelcome: false,
    });
  });

  test("signed out on a screen that is not ready: that phase's own panel, no create button", () => {
    for (const phase of PHASES.filter((p) => p !== "ready")) {
      expect({ phase, ...layout("anonymous", phase, false) }).toEqual({
        phase,
        audience: "signed_out",
        intro: null,
        // Loading, the place is held like the rest of the page, and let go
        // in the frame the proposition arrives in.
        dashboard: phase === "loading" ? "reserve" : "none",
        prizeWelcome: false,
      });
    }
  });

  test("while the session resolves (the server render): the dashboard's place held, nothing in it", () => {
    for (const phase of PHASES) {
      for (const hasTeam of [false, true]) {
        expect(layout("loading", phase, hasTeam, "guest")).toEqual({
          audience: "pending",
          intro: null,
          dashboard: "reserve",
          prizeWelcome: false,
        });
      }
    }
  });

  test("signed in while the screen loads: the place held, never the sections — team or not", () => {
    // The review of the first A16 fix: a signed-in visitor without a team got
    // "Mes ligues", the cup and the switches for as long as the screen
    // loaded, and an owner got "no private leagues" there, because nothing
    // of theirs is fetched before the screen is ready.
    for (const hasTeam of [false, true]) {
      for (const source of ["cloud", "local"] as const) {
        expect(layout("authenticated", "loading", hasTeam, source)).toEqual({
          audience: "signed_in",
          intro: null,
          dashboard: "reserve",
          prizeWelcome: false,
        });
      }
    }
  });

  test("signed in on a closed season, a gameweek not yet playable or a failed request: that panel alone", () => {
    for (const phase of ["season_closed", "awaiting_gameweek", "error"] as const) {
      for (const hasTeam of [false, true]) {
        expect({ phase, hasTeam, ...layout("authenticated", phase, hasTeam) }).toEqual({
          phase,
          hasTeam,
          audience: "signed_in",
          intro: null,
          dashboard: "none",
          prizeWelcome: false,
        });
      }
    }
  });

  test("the prize welcome and the proposition are never on screen together", () => {
    const statuses: AuthStatus[] = ["loading", "anonymous", "guest", "authenticated"];
    const sources: FantasyDataSource[] = ["cloud", "guest", "local"];
    for (const authStatus of statuses) {
      for (const source of sources) {
        for (const phase of PHASES) {
          for (const hasTeam of [false, true]) {
            const result = fantasyHubLayout({ authStatus, source, phase, hasTeam });
            expect(result.intro !== null && result.prizeWelcome).toBe(false);
            expect(result.intro !== null && result.dashboard !== "none").toBe(false);
          }
        }
      }
    }
  });
});

describe("the dashboard sections are an owner's only", () => {
  test("shown exactly when signed in, not a device guest, ready, and with a team", () => {
    const statuses: AuthStatus[] = ["loading", "anonymous", "guest", "authenticated"];
    const sources: FantasyDataSource[] = ["cloud", "guest", "local"];
    for (const authStatus of statuses) {
      for (const source of sources) {
        for (const phase of PHASES) {
          for (const hasTeam of [false, true]) {
            const result = fantasyHubLayout({ authStatus, source, phase, hasTeam });
            const owner =
              authStatus === "authenticated" && source !== "guest" && phase === "ready" && hasTeam;
            expect({
              authStatus,
              source,
              phase,
              hasTeam,
              shown: result.dashboard === "show",
            }).toEqual({ authStatus, source, phase, hasTeam, shown: owner });
            expect(result.audience === "owner").toBe(owner);
            // The dialog opens over those sections, never without them.
            expect(result.prizeWelcome).toBe(owner);
          }
        }
      }
    }
  });
});

describe("joinTarget", () => {
  const base = { number: 1, deadline: "2026-09-25T18:30:00Z" };

  test("the backend's enrolment gameweek, with its own deadline", () => {
    expect(
      joinTarget({
        ...base,
        enrolment: { id: "gw2", number: 2, deadline: "2026-10-02T18:30:00Z" },
      }),
    ).toEqual({ number: 2, deadline: "2026-10-02T18:30:00Z" });
  });

  test("registration closed (enrolment null) has no deadline to meet", () => {
    expect(joinTarget({ ...base, enrolment: null })).toBeNull();
  });

  test("mock mode, with no enrolment at all, uses the current gameweek like the builder", () => {
    expect(joinTarget(base)).toEqual({ number: 1, deadline: "2026-09-25T18:30:00Z" });
  });

  test("no gameweek, no deadline", () => {
    expect(joinTarget(null)).toBeNull();
  });
});

describe("joinDeadlineToShow", () => {
  const joinBy = { number: 2, deadline: "2026-10-02T18:30:00Z" };
  const before = Date.parse("2026-10-01T12:00:00Z");
  const after = Date.parse("2026-10-02T18:31:00Z");

  test("before the first tick (the server, the hydrating frame): shown", () => {
    expect(joinDeadlineToShow(joinBy, null)).toBe(joinBy);
  });

  test("while the clock is before it: shown", () => {
    expect(joinDeadlineToShow(joinBy, deadlineCountdown(joinBy.deadline, before))).toBe(joinBy);
  });

  test("once the clock has passed it: hidden, not a date already gone", () => {
    expect(joinDeadlineToShow(joinBy, deadlineCountdown(joinBy.deadline, after))).toBeNull();
    expect(
      joinDeadlineToShow(joinBy, deadlineCountdown(joinBy.deadline, Date.parse(joinBy.deadline))),
    ).toBeNull();
  });

  test("nothing to join, nothing to show", () => {
    expect(joinDeadlineToShow(null, null)).toBeNull();
    expect(joinDeadlineToShow(null, deadlineCountdown(joinBy.deadline, before))).toBeNull();
  });
});
