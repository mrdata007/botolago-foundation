// Deterministic squad slot reassignment for formation changes and swaps.
// Slots layout (matches Pitch renderer):
//   1     -> starting GK
//   2..1+DEF -> starting DEF
//   next  -> starting MID
//   next  -> starting FWD (up to slot 11)
//   12    -> bench GK
//   13-15 -> bench outfielders in DEF/MID/FWD order

import { FORMATIONS, type FormationKey, type Position, type SquadPlayer } from "@/types/fantasy";
import type { FantasyPlayer } from "@/types/fantasy";

interface Ctx {
  squad: SquadPlayer[];
  players: FantasyPlayer[];
  formation: FormationKey;
}

const OUTFIELD: Position[] = ["DEF", "MID", "FWD"];

/**
 * Reassign slots so the squad matches the target formation.
 * Keeps current starters when possible; otherwise promotes bench players of
 * the required position and demotes surplus outfield starters to the bench.
 * Preserves captain / vice-captain flags.
 */
export function reslotForFormation({ squad, players, formation }: Ctx): SquadPlayer[] {
  const cfg = FORMATIONS[formation];
  const need: Record<Position, number> = { GK: 1, DEF: cfg.DEF, MID: cfg.MID, FWD: cfg.FWD };
  const flags = new Map(squad.map((s) => [s.playerId, { c: !!s.isCaptain, v: !!s.isViceCaptain }]));
  const posOf = (id: string) => players.find((p) => p.id === id)?.position;

  // Group current squad by position, ordering starters (slot < 12) first.
  const grouped: Record<Position, string[]> = { GK: [], DEF: [], MID: [], FWD: [] };
  [...squad]
    .sort((a, b) => a.slot - b.slot)
    .forEach((s) => {
      const pos = posOf(s.playerId);
      if (pos) grouped[pos].push(s.playerId);
    });

  const startingXI: Record<Position, string[]> = { GK: [], DEF: [], MID: [], FWD: [] };
  const bench: Record<Position, string[]> = { GK: [], DEF: [], MID: [], FWD: [] };
  (["GK", ...OUTFIELD] as Position[]).forEach((pos) => {
    const list = grouped[pos];
    list.forEach((id, i) => {
      if (i < need[pos]) startingXI[pos].push(id);
      else bench[pos].push(id);
    });
  });

  const next: SquadPlayer[] = [];
  let slot = 1;
  const push = (id: string) => {
    const f = flags.get(id);
    next.push({ playerId: id, slot: slot++, isCaptain: f?.c, isViceCaptain: f?.v });
  };
  startingXI.GK.forEach(push);
  OUTFIELD.forEach((pos) => startingXI[pos].forEach(push));

  // Bench: GK sub first (slot 12), then outfielders in DEF/MID/FWD order.
  slot = 12;
  bench.GK.forEach(push);
  OUTFIELD.forEach((pos) => bench[pos].forEach(push));

  return next;
}

/**
 * Swap two squad members while preserving starter/bench positional validity
 * for the current formation. Returns null if the swap would violate it.
 */
export function swapSquadMembers(
  squad: SquadPlayer[],
  players: FantasyPlayer[],
  formation: FormationKey,
  aId: string,
  bId: string,
): SquadPlayer[] | null {
  if (aId === bId) return null;
  const a = squad.find((s) => s.playerId === aId);
  const b = squad.find((s) => s.playerId === bId);
  if (!a || !b) return null;
  const pa = players.find((p) => p.id === aId)?.position;
  const pb = players.find((p) => p.id === bId)?.position;
  if (!pa || !pb) return null;

  // Same-position swap is always safe.
  if (pa === pb) {
    return squad.map((s) => {
      if (s.playerId === aId) return { ...s, slot: b.slot };
      if (s.playerId === bId) return { ...s, slot: a.slot };
      return s;
    });
  }

  // Cross-position swap only makes sense when swapping a starter with a bench
  // player and the resulting XI still satisfies the formation. We disallow
  // this for now because a full outfield sub can be modelled via same-position
  // swaps between starter and bench of the same position.
  return null;
}
