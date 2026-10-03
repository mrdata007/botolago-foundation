import { describe, expect, it } from "bun:test";

import type { FantasyAvailabilityView } from "@/services/use-fantasy-availability";
import {
  LANDING_CREATE_PATH,
  LANDING_HUB_PATH,
  LANDING_TEAM_PATH,
  landingCta,
} from "./landing-cta";

/**
 * The landing page's one primary action: decided from the session, the
 * season and the account's team, and never a guess while any of them loads.
 */

const open: FantasyAvailabilityView = { kind: "ready", canCreate: true };
const entriesClosed: FantasyAvailabilityView = { kind: "ready", canCreate: false };
const loading: FantasyAvailabilityView = { kind: "loading" };

describe("landingCta", () => {
  it("waits while the session resolves (the server render), whatever else is known", () => {
    expect(landingCta({ authStatus: "loading", availability: open, hasTeam: true })).toEqual({
      kind: "pending",
    });
  });

  it("sends a visitor without an account straight to the builder", () => {
    for (const authStatus of ["anonymous", "guest"] as const) {
      expect(landingCta({ authStatus, availability: open, hasTeam: undefined })).toEqual({
        kind: "create",
        to: LANDING_CREATE_PATH,
      });
    }
    expect(LANDING_CREATE_PATH).toBe("/fantasy/create");
  });

  it("waits for the season before offering a visitor anything", () => {
    expect(
      landingCta({ authStatus: "anonymous", availability: loading, hasTeam: undefined }).kind,
    ).toBe("pending");
  });

  it("offers a manager their team, never a second one", () => {
    expect(landingCta({ authStatus: "authenticated", availability: open, hasTeam: true })).toEqual({
      kind: "team",
      to: LANDING_TEAM_PATH,
    });
  });

  it("does not show 'Créer' and then 'Voir' to a signed-in reader whose team is still loading", () => {
    expect(
      landingCta({ authStatus: "authenticated", availability: open, hasTeam: undefined }).kind,
    ).toBe("pending");
  });

  it("sends a signed-in reader without a team to the builder", () => {
    expect(landingCta({ authStatus: "authenticated", availability: open, hasTeam: false })).toEqual(
      { kind: "create", to: LANDING_CREATE_PATH },
    );
  });

  it("says the truth when no team can be created now", () => {
    for (const availability of [
      entriesClosed,
      { kind: "season_closed" } as const,
      { kind: "awaiting_gameweek" } as const,
    ]) {
      expect(landingCta({ authStatus: "anonymous", availability, hasTeam: undefined })).toEqual({
        kind: "discover",
        to: LANDING_HUB_PATH,
      });
    }
  });

  it("keeps the way in when the availability probe failed: the builder checks for itself", () => {
    expect(
      landingCta({
        authStatus: "anonymous",
        availability: { kind: "error", error: new Error("x") },
        hasTeam: undefined,
      }).kind,
    ).toBe("create");
  });

  it("still sends a manager to their team when entries are closed", () => {
    expect(
      landingCta({ authStatus: "authenticated", availability: entriesClosed, hasTeam: true }).kind,
    ).toBe("team");
  });
});
