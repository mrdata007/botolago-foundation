import { reslotForFormation } from "@/lib/reslot";
import { validateTeam } from "@/lib/team-validation";
import {
  FORMATIONS,
  type FantasyPlayer,
  type FormationKey,
  type Position,
  type SquadPlayer,
} from "@/types/fantasy";

export interface NoMatchSwap {
  /** The starter whose club has no match this round. */
  outId: string;
  /** The bench player who comes in. */
  inId: string;
  /** The formation after the swap. */
  formation: FormationKey;
  /** Whether the swap changes the formation ("Passez en 3-4-3"). */
  formationChanged: boolean;
  /** The squad after the swap, re-slotted for the pitch. */
  squad: SquadPlayer[];
}

const STARTING_PLACES = 11;

function formationKeyOf(
  squad: readonly SquadPlayer[],
  positionOf: (id: string) => Position | undefined,
): FormationKey | null {
  const counts = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  for (const place of squad) {
    if (place.slot > STARTING_PLACES) continue;
    const position = positionOf(place.playerId);
    if (!position) return null;
    counts[position] += 1;
  }
  if (counts.GK !== 1) return null;
  const key = `${counts.DEF}-${counts.MID}-${counts.FWD}`;
  return key in FORMATIONS ? (key as FormationKey) : null;
}

/**
 * The one-tap fix for a starter whose club has no match this round: swap them
 * with a bench player whose club does play, so long as the resulting XI is a
 * legal formation and the whole team still validates.
 *
 * A bench player of the same position is preferred (no formation change),
 * then the others in bench order. The captain and vice-captain bands follow a
 * swap: if the outgoing starter wore one, the incoming player takes it, so the
 * armband never lands on the bench. Returns `null` when no starter lacks a
 * match, or no legal swap exists; the caller then only warns.
 *
 * `playingClubIds` is the set of clubs with a match, or `null` when the
 * round's fixtures are not known, in which case nothing is claimed.
 */
export function suggestNoMatchSwap(input: {
  squad: readonly SquadPlayer[];
  players: readonly FantasyPlayer[];
  playingClubIds: ReadonlySet<string> | null;
  formation: FormationKey;
}): NoMatchSwap | null {
  const { squad, players, playingClubIds, formation } = input;
  if (!playingClubIds) return null;
  const byId = new Map(players.map((player) => [player.id, player] as const));
  const positionOf = (id: string) => byId.get(id)?.position;
  const plays = (id: string) => {
    const club = byId.get(id)?.clubId;
    return club !== undefined && playingClubIds.has(club);
  };

  const starters = squad.filter((place) => place.slot <= STARTING_PLACES);
  const bench = squad
    .filter((place) => place.slot > STARTING_PLACES)
    .sort((a, b) => a.slot - b.slot);

  for (const out of starters.sort((a, b) => a.slot - b.slot)) {
    const club = byId.get(out.playerId)?.clubId;
    if (club === undefined || plays(out.playerId)) continue;
    const outPosition = positionOf(out.playerId);
    const candidates = [
      ...bench.filter((place) => positionOf(place.playerId) === outPosition),
      ...bench.filter((place) => positionOf(place.playerId) !== outPosition),
    ].filter((place) => plays(place.playerId));

    for (const incoming of candidates) {
      const swapped = squad.map((place) => {
        if (place.playerId === out.playerId) {
          return { ...place, slot: incoming.slot, isCaptain: false, isViceCaptain: false };
        }
        if (place.playerId === incoming.playerId) {
          return {
            ...place,
            slot: out.slot,
            isCaptain: out.isCaptain || place.isCaptain,
            isViceCaptain: out.isViceCaptain || place.isViceCaptain,
          };
        }
        return place;
      });
      const next = formationKeyOf(swapped, positionOf);
      if (!next) continue;
      const slotted = reslotForFormation({
        squad: swapped,
        players: [...players],
        formation: next,
      });
      if (!validateTeam(slotted, next, [...players]).ok) continue;
      return {
        outId: out.playerId,
        inId: incoming.playerId,
        formation: next,
        formationChanged: next !== formation,
        squad: slotted,
      };
    }
  }
  return null;
}

/** Starters of `squad` whose club has no match; empty when the fixtures are not known. */
export function startersWithoutMatch(
  squad: readonly SquadPlayer[],
  players: readonly Pick<FantasyPlayer, "id" | "clubId">[],
  playingClubIds: ReadonlySet<string> | null,
): string[] {
  if (!playingClubIds) return [];
  const clubOf = new Map(players.map((player) => [player.id, player.clubId] as const));
  return squad
    .filter((place) => place.slot <= STARTING_PLACES)
    .filter((place) => {
      const club = clubOf.get(place.playerId);
      return club !== undefined && !playingClubIds.has(club);
    })
    .sort((a, b) => a.slot - b.slot)
    .map((place) => place.playerId);
}
