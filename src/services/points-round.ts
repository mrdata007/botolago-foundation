// What the points screen shows for ONE round, kept apart from today's state.
//
// A round's result is a record: the captain and vice-captain the manager chose
// for it, and who each player was in it. Today's buying pool and today's squad
// answer a different question ("who can I pick now"), and letting them fill
// gaps in an old round rewrote it (FANT-07, FANT-08, ASTRA-01).
//
// Pure: no I/O, no rules. The server stays the authority for every figure.

import type { PointsViewModel } from "@/services/points-service";
import type { FantasyPlayer, FantasyTeam, PlayerPointsBreakdown } from "@/types/fantasy";

export interface RoundRoles {
  /** Who carries the multiplier (the server's answer). `null` stays `null`. */
  captainId: string | null;
  /** The captain the manager chose for the round, whether or not he carried it. */
  originalCaptainId: string | null;
  /** The vice-captain the manager chose for the round. */
  viceId: string | null;
}

/**
 * The roles of the round on screen.
 *
 * With a result, they are the result's own; an effective captain of `null`
 * (nothing scored yet, or neither armband-holder appeared) is kept, never
 * replaced by today's captain. Only a round with no result at all, which has
 * nothing recorded to show, reads the squad being edited.
 */
export function roundRoles(vm: PointsViewModel | null, team: FantasyTeam): RoundRoles {
  if (vm) {
    return {
      captainId: vm.effectiveCaptainId,
      originalCaptainId: vm.originalCaptainId ?? null,
      viceId: vm.viceCaptainId ?? null,
    };
  }
  const captain = team.squad.find((s) => s.isCaptain)?.playerId ?? null;
  return {
    captainId: captain,
    originalCaptainId: captain,
    viceId: team.squad.find((s) => s.isViceCaptain)?.playerId ?? null,
  };
}

export interface RoundPlayers {
  /** Today's pool, with each player of the round shown as the server read him for it. */
  players: FantasyPlayer[];
  /** Players of the round whom today's pool no longer offers (his figures are not today's). */
  missingFromCatalogIds: ReadonlySet<string>;
  /** Players of the round nobody can name: not in the pool and not described by the server. */
  unresolvedIds: string[];
}

/**
 * The roster a round is drawn from.
 *
 * - A player the server describes is shown as described (name, position, club
 *   of that round), over whatever today's pool says; the pool still supplies
 *   what only it knows (photo, price, form, ownership).
 * - A described player the pool no longer has is added, with no price, form or
 *   ownership of his own: callers show a dash for those, not zeros.
 * - A player neither side describes is reported in `unresolvedIds`, so the
 *   screen can say its total includes someone it cannot name.
 */
export function resolveRoundPlayers(
  pool: readonly FantasyPlayer[],
  breakdown: readonly PlayerPointsBreakdown[],
): RoundPlayers {
  const byId = new Map(pool.map((player) => [player.id, player]));
  const players = new Map(byId);
  const missingFromCatalogIds = new Set<string>();
  const unresolvedIds: string[] = [];

  for (const row of breakdown) {
    const today = byId.get(row.playerId);
    const identity = row.identity;
    if (!today) missingFromCatalogIds.add(row.playerId);
    if (!identity) {
      if (!today) unresolvedIds.push(row.playerId);
      continue;
    }
    players.set(row.playerId, {
      // What only the pool knows, when it still knows him.
      price: 0,
      totalPoints: 0,
      form: null,
      ownership: 0,
      status: "available",
      ...today,
      id: row.playerId,
      name: { fr: identity.name, ar: identity.name },
      position: identity.position,
      clubId: identity.clubId,
    });
  }

  return { players: [...players.values()], missingFromCatalogIds, unresolvedIds };
}
