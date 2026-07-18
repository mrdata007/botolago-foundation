// Pure team validation. Called by the Team route before persisting and by
// tests to pin the guarantees: exact squad size, formation legality, one
// captain, one vice, both distinct and inside the starting XI.

import type { FantasyPlayer, FormationKey, SquadPlayer } from "@/types/fantasy";
import { FORMATIONS } from "@/types/fantasy";

export type TeamValidationError =
  | "invalid_size"
  | "invalid_formation"
  | "no_captain"
  | "no_vice"
  | "captain_vice_same"
  | "captain_not_in_xi"
  | "vice_not_in_xi";

export type TeamValidationResult =
  | { ok: true }
  | { ok: false; error: TeamValidationError };

export function validateTeam(
  squad: SquadPlayer[],
  formation: FormationKey,
  players: FantasyPlayer[],
): TeamValidationResult {
  if (squad.length !== 15) return { ok: false, error: "invalid_size" };
  const xi = squad.filter((s) => s.slot < 12);
  const bench = squad.filter((s) => s.slot >= 12);
  if (xi.length !== 11 || bench.length !== 4) return { ok: false, error: "invalid_size" };

  const cfg = FORMATIONS[formation];
  if (!cfg) return { ok: false, error: "invalid_formation" };

  const counts = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  for (const s of xi) {
    const p = players.find((x) => x.id === s.playerId);
    if (!p) return { ok: false, error: "invalid_size" };
    counts[p.position]++;
  }
  if (
    counts.GK !== 1 ||
    counts.DEF !== cfg.DEF ||
    counts.MID !== cfg.MID ||
    counts.FWD !== cfg.FWD
  ) {
    return { ok: false, error: "invalid_formation" };
  }

  const captains = squad.filter((s) => s.isCaptain);
  const vices = squad.filter((s) => s.isViceCaptain);
  if (captains.length !== 1) return { ok: false, error: "no_captain" };
  if (vices.length !== 1) return { ok: false, error: "no_vice" };
  const cap = captains[0];
  const vc = vices[0];
  if (cap.playerId === vc.playerId) return { ok: false, error: "captain_vice_same" };
  if (cap.slot >= 12) return { ok: false, error: "captain_not_in_xi" };
  if (vc.slot >= 12) return { ok: false, error: "vice_not_in_xi" };

  return { ok: true };
}
