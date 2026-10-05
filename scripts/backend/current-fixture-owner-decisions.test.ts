import { describe, expect, test } from "bun:test";
import {
  loadOwnerDecisions,
  ownerDecisionCoverage,
  parseOwnerDecisions,
  unnamedStarterNames,
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
const naming = {
  fixtureExternalId: "19885594",
  kind: "nameUnnamedStarter",
  externalTeamId: "2846",
  externalPlayerId: "37771847",
  status: "approved",
  evidence: "The one starter of the official team sheet without a provider id.",
  approvedBy: "owner",
  approvedOn: "2026-10-04",
};
const file = (...decisions: unknown[]) => JSON.stringify({ decisions });

describe("owner decisions for one fixture", () => {
  test("the reviewed file parses", () => {
    expect(loadOwnerDecisions().length).toBeGreaterThan(0);
  });
  test("19874709 carries both approved decisions of the reviewed file", () => {
    expect(ownerDecisionCoverage(loadOwnerDecisions(), "19874709")).toEqual({
      heldPlayersNotInSquad: ["7aadc3e9-0166-49c1-8646-262b302358e3"],
      placeAtFixtureClub: [{ externalPlayerId: "37771847", externalTeamId: "2846" }],
    });
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
  test("an approved unnamed starter naming is used for its fixture only; a proposed one is not", () => {
    const decisions = parseOwnerDecisions(
      file(
        naming,
        { ...naming, externalTeamId: "270260", status: "proposed", approvedBy: null },
        { ...naming, fixtureExternalId: "19885595", externalPlayerId: "404731" },
      ),
    );
    expect(decisions[0]).toEqual({
      fixtureExternalId: "19885594",
      kind: "nameUnnamedStarter",
      externalPlayerId: "37771847",
      externalTeamId: "2846",
      status: "approved",
    });
    expect(unnamedStarterNames(decisions, "19885594")).toEqual([
      { externalPlayerId: "37771847", externalTeamId: "2846" },
    ]);
    expect(unnamedStarterNames(decisions, "19885596")).toEqual([]);
    // Applied by the importer to the payload, never sent as a decision key.
    expect(ownerDecisionCoverage(decisions, "19885594")).toEqual({});
    // The other kinds are not namings.
    expect(unnamedStarterNames(parseOwnerDecisions(file(held, placed)), "19874709")).toEqual([]);
  });
  test("the reviewed file carries the approved GW2 decisions", () => {
    const decisions = loadOwnerDecisions();
    expect(unnamedStarterNames(decisions, "19885594")).toEqual([
      { externalPlayerId: "37771847", externalTeamId: "2846" },
    ]);
    expect(ownerDecisionCoverage(decisions, "19885594")).toEqual({
      placeAtFixtureClub: [{ externalPlayerId: "37771847", externalTeamId: "2846" }],
    });
    expect(ownerDecisionCoverage(decisions, "19885590")).toEqual({
      heldPlayersNotInSquad: ["fdea9c0e-1080-4951-883c-ea3b77460904"],
    });
    expect(ownerDecisionCoverage(decisions, "19885591")).toEqual({
      heldPlayersNotInSquad: ["7aadc3e9-0166-49c1-8646-262b302358e3"],
    });
    expect(ownerDecisionCoverage(decisions, "19885595")).toEqual({
      placeAtFixtureClub: [{ externalPlayerId: "404731", externalTeamId: "270260" }],
    });
    expect(ownerDecisionCoverage(decisions, "19885596")).toEqual({
      placeAtFixtureClub: [{ externalPlayerId: "37666131", externalTeamId: "306" }],
    });
  });
  for (const [label, entry] of [
    ["an approval without who and when", { ...held, approvedBy: null }],
    ["an unknown kind", { ...held, kind: "skipFixture" }],
    ["an unknown status", { ...held, status: "maybe" }],
    ["a malformed Fantasy id", { ...held, fantasyPlayerId: "7aadc3e9" }],
    ["a malformed provider id", { ...placed, externalPlayerId: "04731" }],
    ["a malformed fixture id", { ...placed, fixtureExternalId: "abc" }],
    ["a naming without a club", { ...naming, externalTeamId: undefined }],
    ["a naming with a numeric provider id", { ...naming, externalPlayerId: 37771847 }],
    ["a naming with a leading zero", { ...naming, externalTeamId: "02846" }],
    ["a naming approved without who", { ...naming, approvedBy: null }],
    ["a naming with a Fantasy id instead", { ...naming, externalPlayerId: held.fantasyPlayerId }],
  ] as const)
    test(`refuses the whole file for ${label}`, () => {
      expect(() => parseOwnerDecisions(file(entry))).toThrow("owner_decisions_invalid");
    });
});
