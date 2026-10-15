// Run with: `bun test src/services/points-round.test.ts`
import "./__test-shim";
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { pointsDto } from "./fantasy-runtime";
import { buildServerPointsViewModel } from "./points-service";
import { resolveRoundPlayers, roundRoles } from "./points-round";
import { fantasyPointsSchema } from "@/backend/fantasy/contracts";
import type { FantasyPlayer, FantasyTeam, GameweekResult } from "@/types/fantasy";

/**
 * FANT-07, FANT-08, ASTRA-01 — an old round keeps its own identity.
 *
 * The server's result for a round names who was captain and vice-captain THAT
 * round and (from migration 20261015120300) who each player was. Today's
 * catalogue and today's squad are not allowed to rewrite it.
 */

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const CLUB_OLD = uuid(901);
const CLUB_NEW = uuid(902);

interface RowSpec {
  id: number;
  slot?: "starter" | "bench";
  captain?: boolean;
  vice?: boolean;
  multiplier?: number;
  identity?: { name: string; position: "GK" | "DEF" | "MID" | "FWD"; club?: string } | null;
  minutes?: number | null;
}

const FINAL_RESULT = {
  startingPoints: 20,
  benchPoints: 4,
  captainPoints: 5,
  transferHit: 0,
  chipType: null,
  provisionalScore: 25,
  finalScore: 25,
  state: "final",
  rank: 1,
  overallRank: 1,
  calculationVersion: 3,
  finalizedAt: "2026-10-12T10:00:00Z",
};

function payload(rows: RowSpec[], over: Record<string, unknown> = {}) {
  return fantasyPointsSchema.parse({
    teamId: uuid(1),
    gameweekId: uuid(2),
    gameweekStatus: "finalized",
    pointsState: "final",
    result: FINAL_RESULT,
    players: rows.map((row, index) => ({
      fantasyPlayerId: uuid(row.id),
      slot: row.slot ?? "starter",
      slotOrder: index + 1,
      captain: row.captain ?? false,
      viceCaptain: row.vice ?? false,
      multiplier: row.multiplier ?? 1,
      provisionalPoints: 5,
      finalPoints: 5,
      didPlay: row.minutes === null ? null : true,
      minutesPlayed: row.minutes === undefined ? 90 : row.minutes,
      events: [],
      ...(row.identity === undefined
        ? {}
        : row.identity === null
          ? { identity: null }
          : {
              identity: {
                name: row.identity.name,
                position: row.identity.position,
                footballTeamId: row.identity.club ?? CLUB_OLD,
                teamName: "Old Club",
                teamShortName: "OLD",
              },
            }),
    })),
    autoSubstitutions: [],
    ...over,
  });
}

const resultOf = (rows: RowSpec[], over: Record<string, unknown> = {}): GameweekResult => {
  const result = pointsDto(5, payload(rows, over), null);
  if (!result) throw new Error("expected a result");
  return result;
};

function pool(id: number, position: FantasyPlayer["position"], clubId = CLUB_NEW): FantasyPlayer {
  return {
    id: uuid(id),
    name: { fr: `today-${id}`, ar: `today-${id}` },
    position,
    clubId,
    price: 7.5,
    form: 4,
    totalPoints: 30,
    ownership: 12,
    status: "available",
  };
}

const teamWith = (captain: number, vice: number): FantasyTeam => ({
  managerName: "T",
  teamName: "T",
  formation: "4-4-2",
  squad: [1, 2, 3].map((id, index) => ({
    playerId: uuid(id),
    slot: index + 1,
    isCaptain: id === captain,
    isViceCaptain: id === vice,
  })),
  bank: 0,
  freeTransfers: 1,
  pendingTransfers: 0,
});

describe("FANT-07 — the player, position and club of that round", () => {
  it("carries the server's frozen identity into the result", () => {
    const result = resultOf([
      { id: 1, identity: { name: "Retired Keeper", position: "GK" } },
      { id: 2, identity: null },
      { id: 3 },
    ]);
    expect(result.breakdown[0]?.identity).toEqual({
      name: "Retired Keeper",
      position: "GK",
      clubId: CLUB_OLD,
      teamName: "Old Club",
      teamShortName: "OLD",
    });
    // A server that does not send it yet (or has no row) leaves it unset.
    expect(result.breakdown[1]?.identity).toBeUndefined();
    expect(result.breakdown[2]?.identity).toBeUndefined();
  });

  it("keeps a player who is no longer in today's catalogue, with his own position and club", () => {
    const result = resultOf([{ id: 1, identity: { name: "Retired Keeper", position: "GK" } }]);
    // Today's catalogue has neither him nor his club.
    const { players, unresolvedIds, missingFromCatalogIds } = resolveRoundPlayers(
      [pool(2, "DEF")],
      result.breakdown,
    );
    const kept = players.find((p) => p.id === uuid(1));
    expect(kept?.name.fr).toBe("Retired Keeper");
    expect(kept?.position).toBe("GK");
    expect(kept?.clubId).toBe(CLUB_OLD);
    expect(unresolvedIds).toEqual([]);
    expect(missingFromCatalogIds.has(uuid(1))).toBe(true);
    expect(missingFromCatalogIds.has(uuid(2))).toBe(false);
  });

  it("does not let today's club or position overwrite the round's", () => {
    const result = resultOf([{ id: 1, identity: { name: "Mid then", position: "MID" } }]);
    const { players } = resolveRoundPlayers([pool(1, "FWD", CLUB_NEW)], result.breakdown);
    const shown = players.find((p) => p.id === uuid(1));
    expect(shown?.position).toBe("MID");
    expect(shown?.clubId).toBe(CLUB_OLD);
    // Everything else is today's catalogue, untouched (the photo, the price).
    expect(shown?.price).toBe(7.5);
  });

  it("says which players it cannot name at all, rather than dropping them", () => {
    const result = resultOf([{ id: 1 }, { id: 2 }]);
    const { players, unresolvedIds } = resolveRoundPlayers([pool(2, "DEF")], result.breakdown);
    expect(unresolvedIds).toEqual([uuid(1)]);
    expect(players.some((p) => p.id === uuid(1))).toBe(false);
  });
});

describe("FANT-08 — the captain and vice-captain of that round", () => {
  it("shows the vice-captain recorded for the round, not today's", () => {
    const result = resultOf([
      { id: 1, captain: true, multiplier: 2 },
      { id: 2, vice: true },
      { id: 3 },
    ]);
    const vm = buildServerPointsViewModel(result);
    // Today the manager has made player 3 the vice-captain.
    const roles = roundRoles(vm, teamWith(1, 3));
    expect(roles.viceId).toBe(uuid(2));
    expect(roles.originalCaptainId).toBe(uuid(1));
    expect(roles.captainId).toBe(uuid(1));
  });

  it("is stable when a later squad no longer has that vice-captain at all", () => {
    const result = resultOf([
      { id: 1, captain: true, multiplier: 2 },
      { id: 2, vice: true },
    ]);
    const roles = roundRoles(buildServerPointsViewModel(result), teamWith(3, 3));
    expect(roles.viceId).toBe(uuid(2));
  });

  it("keeps the original captain apart from the effective one when the vice took over", () => {
    const result = resultOf([
      { id: 1, captain: true, minutes: 0 },
      { id: 2, vice: true, multiplier: 2 },
    ]);
    const vm = buildServerPointsViewModel(result);
    expect(vm.captainTookOver).toBe(true);
    const roles = roundRoles(vm, teamWith(3, 1));
    expect(roles.captainId).toBe(uuid(2));
    expect(roles.originalCaptainId).toBe(uuid(1));
    expect(roles.viceId).toBe(uuid(2));
  });

  it("with a triple captain chip the multiplier is the server's, the roles unchanged", () => {
    const result = resultOf(
      [
        { id: 1, captain: true, multiplier: 3 },
        { id: 2, vice: true },
      ],
      { result: { ...FINAL_RESULT, captainPoints: 10, chipType: "triple_captain" } },
    );
    const vm = buildServerPointsViewModel(result);
    expect(vm.captainMultiplier).toBe(3);
    expect(vm.captainBonus).toBe(10);
    expect(roundRoles(vm, teamWith(3, 3))).toMatchObject({
      captainId: uuid(1),
      viceId: uuid(2),
    });
  });
});

describe("ASTRA-01 — an authoritative null effective captain stays null", () => {
  const pending = () =>
    buildServerPointsViewModel(
      resultOf(
        [{ id: 1, captain: true, minutes: null }, { id: 2, vice: true, minutes: null }, { id: 3 }],
        {
          pointsState: "provisional",
          gameweekStatus: "live",
        },
      ),
    );

  it("has no effective captain in a pending result", () => {
    expect(pending().effectiveCaptainId).toBeNull();
  });

  it("is not replaced by today's squad captain", () => {
    const roles = roundRoles(pending(), teamWith(3, 3));
    expect(roles.captainId).toBeNull();
    // The roles the manager chose for that round are still there, distinct.
    expect(roles.originalCaptainId).toBe(uuid(1));
    expect(roles.viceId).toBe(uuid(2));
  });

  it("falls back to the squad only when there is no result at all", () => {
    const roles = roundRoles(null, teamWith(3, 2));
    expect(roles.captainId).toBe(uuid(3));
    expect(roles.viceId).toBe(uuid(2));
  });

  it("is the same for a vice-captain who did not appear either", () => {
    const vm = buildServerPointsViewModel(
      resultOf([
        { id: 1, captain: true, minutes: 0 },
        { id: 2, vice: true, minutes: 0 },
      ]),
    );
    expect(vm.effectiveCaptainId).toBeNull();
    expect(roundRoles(vm, teamWith(3, 3)).captainId).toBeNull();
  });
});

describe("the migration that serves the identity (20261015120300)", () => {
  const sql = readFileSync(
    join(
      import.meta.dir,
      "..",
      "..",
      "supabase",
      "migrations",
      "20261015120300_fantasy_points_player_identity.sql",
    ),
    "utf8",
  );
  const code = sql.replace(/--.*$/gm, "");

  it("only reads, and wraps the existing function so its guards stay in force", () => {
    expect(code).not.toMatch(/\b(insert|update|delete|truncate|drop)\b/i);
    expect(code).toContain("rename to get_my_fantasy_points_before_identity");
    expect(code).toContain("api.get_my_fantasy_points_before_identity(p_team_id, p_gameweek_id)");
    expect(code).toMatch(
      /grant execute on function api\.get_my_fantasy_points\(uuid, uuid\)\s+to authenticated, service_role/,
    );
  });

  it("does not filter on active or eligible, which is the point", () => {
    expect(code).not.toMatch(/\.(active|eligible)\b/);
  });

  it("sends exactly the keys the contract reads", () => {
    for (const key of ["name", "position", "footballTeamId", "teamName", "teamShortName"]) {
      expect(code).toContain(`'${key}'`);
    }
  });
});

describe("the points screen reads these through the round's own model", () => {
  const source = readFileSync(join(import.meta.dir, "..", "routes", "fantasy.points.tsx"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

  it("no longer falls back to today's squad for a round that has a result", () => {
    expect(source).not.toMatch(/vm\?\.effectiveCaptainId \?\?/);
    expect(source).not.toMatch(/const viceId = team\.squad/);
    expect(source).toContain("roundRoles(vm, team)");
    expect(source).toContain("resolveRoundPlayers(");
  });

  it("looks players up in the round's roster, not in today's catalogue", () => {
    expect(source).toMatch(/const playerOf = \(id: string\) => roster\.find/);
    expect(source).toMatch(/players=\{roster\}/);
  });
});
