import { describe, expect, test } from "bun:test";
import {
  loadOwnerDecisions,
  ownerDecisionCoverage,
  parseOwnerDecisions,
} from "./current-fixture-owner-decisions";

const held = {
  fixtureExternalId: "19874709",
  kind: "heldPlayerNotInSquad",
  fantasyPlayerId: "7aadc3e9-0166-49c1-8646-262b302358e3",
  status: "approved",
  approvedBy: "owner",
  approvedOn: "2026-10-04",
};
const placed = {
  fixtureExternalId: "19874710",
  kind: "placeAtFixtureClub",
  externalPlayerId: "404731",
  externalTeamId: "270260",
  status: "proposed",
  approvedBy: null,
  approvedOn: null,
};
const file = (...decisions: unknown[]) => JSON.stringify({ decisions });

describe("owner decisions for one fixture", () => {
  test("the reviewed file parses", () => {
    expect(loadOwnerDecisions().length).toBeGreaterThan(0);
  });
  test("approved entries of the fixture only, by kind", () => {
    const decisions = parseOwnerDecisions(file(held, placed, { ...placed, status: "withdrawn" }));
    expect(ownerDecisionCoverage(decisions, "19874709")).toEqual({
      heldPlayersNotInSquad: ["7aadc3e9-0166-49c1-8646-262b302358e3"],
    });
    expect(ownerDecisionCoverage(decisions, "19874710")).toEqual({});
    const approved = parseOwnerDecisions(
      file({ ...placed, status: "approved", approvedBy: "owner", approvedOn: "2026-10-04" }),
    );
    expect(ownerDecisionCoverage(approved, "19874710")).toEqual({
      placeAtFixtureClub: [{ externalPlayerId: "404731", externalTeamId: "270260" }],
    });
  });
  for (const [label, entry] of [
    ["an approval without who and when", { ...held, approvedBy: null }],
    ["an unknown kind", { ...held, kind: "skipFixture" }],
    ["an unknown status", { ...held, status: "maybe" }],
    ["a malformed Fantasy id", { ...held, fantasyPlayerId: "7aadc3e9" }],
    ["a malformed provider id", { ...placed, externalPlayerId: "04731" }],
    ["a malformed fixture id", { ...placed, fixtureExternalId: "abc" }],
  ] as const)
    test(`refuses the whole file for ${label}`, () => {
      expect(() => parseOwnerDecisions(file(entry))).toThrow("owner_decisions_invalid");
    });
});
