// Pure team validation. Called by the Team route before persisting and by
// tests to pin the guarantees: exact squad size, formation legality, one
// captain, one vice, both distinct and inside the starting XI.

import type { FantasyPlayer, FormationKey, SquadPlayer } from "@/types/fantasy";
import { FORMATIONS, SQUAD_RULES } from "@/types/fantasy";

export interface TeamValidationRules {
  totalSize: number;
  startingSize: number;
  perPosition: Record<FantasyPlayer["position"], number>;
  startingMinimum: Record<FantasyPlayer["position"], number>;
  startingMaximum: Record<FantasyPlayer["position"], number>;
}

const DEFAULT_VALIDATION_RULES: TeamValidationRules = {
  totalSize: SQUAD_RULES.totalSize,
  startingSize: SQUAD_RULES.startingXI,
  perPosition: SQUAD_RULES.perPosition,
  startingMinimum: { GK: 1, DEF: 3, MID: 2, FWD: 1 },
  startingMaximum: { GK: 1, DEF: 5, MID: 5, FWD: 3 },
};

export type TeamValidationError =
  | "invalid_size"
  | "invalid_formation"
  | "no_captain"
  | "no_vice"
  | "captain_vice_same"
  | "captain_not_in_xi"
  | "vice_not_in_xi";

export type TeamValidationResult = { ok: true } | { ok: false; error: TeamValidationError };

export function hasSquadCatalogCoverage(squad: SquadPlayer[], players: FantasyPlayer[]): boolean {
  const catalogIds = new Set(players.map((player) => player.id));
  return squad.every((slot) => catalogIds.has(slot.playerId));
}

export function validateTeam(
  squad: SquadPlayer[],
  formation: FormationKey,
  players: FantasyPlayer[],
  rules: TeamValidationRules = DEFAULT_VALIDATION_RULES,
): TeamValidationResult {
  if (squad.length !== rules.totalSize) return { ok: false, error: "invalid_size" };
  const xi = squad.filter((s) => s.slot <= rules.startingSize);
  const bench = squad.filter((s) => s.slot > rules.startingSize);
  if (xi.length !== rules.startingSize || bench.length !== rules.totalSize - rules.startingSize) {
    return { ok: false, error: "invalid_size" };
  }

  const cfg = FORMATIONS[formation];
  if (!cfg) return { ok: false, error: "invalid_formation" };
  if (
    cfg.DEF < rules.startingMinimum.DEF ||
    cfg.DEF > rules.startingMaximum.DEF ||
    cfg.MID < rules.startingMinimum.MID ||
    cfg.MID > rules.startingMaximum.MID ||
    cfg.FWD < rules.startingMinimum.FWD ||
    cfg.FWD > rules.startingMaximum.FWD
  ) {
    return { ok: false, error: "invalid_formation" };
  }

  const counts = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  for (const s of xi) {
    const p = players.find((x) => x.id === s.playerId);
    if (!p) return { ok: false, error: "invalid_size" };
    counts[p.position]++;
  }
  const squadCounts = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  for (const s of squad) {
    const player = players.find((candidate) => candidate.id === s.playerId);
    if (!player) return { ok: false, error: "invalid_size" };
    squadCounts[player.position] += 1;
  }
  if (
    Object.entries(rules.perPosition).some(
      ([position, required]) => squadCounts[position as keyof typeof squadCounts] !== required,
    )
  ) {
    return { ok: false, error: "invalid_size" };
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
  if (cap.slot > rules.startingSize) return { ok: false, error: "captain_not_in_xi" };
  if (vc.slot > rules.startingSize) return { ok: false, error: "vice_not_in_xi" };

  return { ok: true };
}
