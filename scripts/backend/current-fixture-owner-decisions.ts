/**
 * Owner decisions for one finished fixture, read from the reviewed file
 * current-fixture-owner-decisions.json and sent with that fixture's coverage
 * (20261004120000). Only approved entries are sent; the database re-checks
 * each one, so a decision made for a world that has changed stops the fixture
 * instead of being applied to the wrong one.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export type OwnerDecision =
  | {
      fixtureExternalId: string;
      kind: "heldPlayerNotInSquad";
      fantasyPlayerId: string;
      status: "proposed" | "approved" | "withdrawn";
    }
  | {
      fixtureExternalId: string;
      kind: "placeAtFixtureClub";
      externalPlayerId: string;
      externalTeamId: string;
      status: "proposed" | "approved" | "withdrawn";
    }
  | {
      /**
       * The one unnamed starter (provider `player_id` null) of this club in
       * this fixture is this provider player, from the official team sheet.
       * Applied by the importer before the fixture's rows are built; it never
       * guesses, so anything but exactly one such starter, or a player already
       * in the lineup, stops the fixture.
       */
      fixtureExternalId: string;
      kind: "nameUnnamedStarter";
      externalPlayerId: string;
      externalTeamId: string;
      status: "proposed" | "approved" | "withdrawn";
    };

export class OwnerDecisionFileError extends Error {}

const providerId = /^[1-9]\d{0,14}$/;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Parses the file's JSON; any entry of the wrong shape refuses the whole file. */
export function parseOwnerDecisions(text: string): OwnerDecision[] {
  const file = JSON.parse(text) as { decisions?: unknown };
  if (!Array.isArray(file.decisions)) throw new OwnerDecisionFileError("owner_decisions_invalid");
  return file.decisions.map((raw) => {
    const entry = raw as Record<string, unknown>;
    const status = entry.status;
    if (
      typeof entry.fixtureExternalId !== "string" ||
      !providerId.test(entry.fixtureExternalId) ||
      (status !== "proposed" && status !== "approved" && status !== "withdrawn") ||
      (status === "approved" &&
        (typeof entry.approvedBy !== "string" || typeof entry.approvedOn !== "string"))
    )
      throw new OwnerDecisionFileError("owner_decisions_invalid");
    if (
      entry.kind === "heldPlayerNotInSquad" &&
      typeof entry.fantasyPlayerId === "string" &&
      uuid.test(entry.fantasyPlayerId)
    )
      return {
        fixtureExternalId: entry.fixtureExternalId,
        kind: entry.kind,
        fantasyPlayerId: entry.fantasyPlayerId,
        status,
      };
    if (
      (entry.kind === "placeAtFixtureClub" || entry.kind === "nameUnnamedStarter") &&
      typeof entry.externalPlayerId === "string" &&
      providerId.test(entry.externalPlayerId) &&
      typeof entry.externalTeamId === "string" &&
      providerId.test(entry.externalTeamId)
    )
      return {
        fixtureExternalId: entry.fixtureExternalId,
        kind: entry.kind,
        externalPlayerId: entry.externalPlayerId,
        externalTeamId: entry.externalTeamId,
        status,
      };
    throw new OwnerDecisionFileError("owner_decisions_invalid");
  });
}

export function loadOwnerDecisions(
  path = resolve(import.meta.dir, "current-fixture-owner-decisions.json"),
): OwnerDecision[] {
  return parseOwnerDecisions(readFileSync(path, "utf8"));
}

/** Approved `nameUnnamedStarter` decisions of one fixture, in file order. */
export function unnamedStarterNames(
  decisions: OwnerDecision[],
  fixtureExternalId: string,
): Array<{ externalPlayerId: string; externalTeamId: string }> {
  return decisions.flatMap((entry) =>
    entry.kind === "nameUnnamedStarter" &&
    entry.fixtureExternalId === fixtureExternalId &&
    entry.status === "approved"
      ? [{ externalPlayerId: entry.externalPlayerId, externalTeamId: entry.externalTeamId }]
      : [],
  );
}

/**
 * The coverage keys for one fixture: approved decisions only, none when there
 * are none. `nameUnnamedStarter` is not among them: the importer applies it to
 * the provider payload and records what it named (`namedUnnamedStarters`).
 */
export function ownerDecisionCoverage(
  decisions: OwnerDecision[],
  fixtureExternalId: string,
): {
  heldPlayersNotInSquad?: string[];
  placeAtFixtureClub?: Array<{ externalPlayerId: string; externalTeamId: string }>;
} {
  const approved = decisions.filter(
    (entry) => entry.fixtureExternalId === fixtureExternalId && entry.status === "approved",
  );
  const absent = approved.flatMap((entry) =>
    entry.kind === "heldPlayerNotInSquad" ? [entry.fantasyPlayerId] : [],
  );
  const placed = approved.flatMap((entry) =>
    entry.kind === "placeAtFixtureClub"
      ? [{ externalPlayerId: entry.externalPlayerId, externalTeamId: entry.externalTeamId }]
      : [],
  );
  return {
    ...(absent.length ? { heldPlayersNotInSquad: absent } : {}),
    ...(placed.length ? { placeAtFixtureClub: placed } : {}),
  };
}
