import { FORMATIONS, SQUAD_RULES, type FormationKey, type Position } from "@/types/fantasy";
import type { FantasyPlayer } from "@/types/fantasy";

export interface ValidationIssue {
  code:
    | "squad_size"
    | "position_count"
    | "club_limit"
    | "budget"
    | "formation_invalid"
    | "captain_missing"
    | "duplicate";
  key: string; // dictionary key
  extra?: Record<string, string | number>;
}

export interface SquadInput {
  playerIds: string[]; // 15 ids
  players: FantasyPlayer[]; // pool for lookup
  bank: number;
  budget?: number;
}

export function validateSquad(input: SquadInput): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const budget = input.budget ?? SQUAD_RULES.budget;
  const ids = input.playerIds;
  const dedup = new Set(ids);
  if (dedup.size !== ids.length) issues.push({ code: "duplicate", key: "fantasy.validation.duplicate" });
  if (ids.length !== SQUAD_RULES.totalSize)
    issues.push({ code: "squad_size", key: "fantasy.validation.squad_size", extra: { n: SQUAD_RULES.totalSize } });

  const players = ids.map((id) => input.players.find((p) => p.id === id)).filter(Boolean) as FantasyPlayer[];
  const byPos: Record<Position, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  const byClub: Record<string, number> = {};
  let cost = 0;
  players.forEach((p) => {
    byPos[p.position]++;
    byClub[p.clubId] = (byClub[p.clubId] ?? 0) + 1;
    cost += p.price;
  });
  (Object.keys(SQUAD_RULES.perPosition) as Position[]).forEach((pos) => {
    if (byPos[pos] !== SQUAD_RULES.perPosition[pos])
      issues.push({ code: "position_count", key: "fantasy.validation.position_count", extra: { pos, n: SQUAD_RULES.perPosition[pos] } });
  });
  Object.entries(byClub).forEach(([clubId, n]) => {
    if (n > SQUAD_RULES.maxPerClub)
      issues.push({ code: "club_limit", key: "fantasy.validation.club_limit", extra: { clubId, max: SQUAD_RULES.maxPerClub } });
  });
  if (cost - input.bank > budget)
    issues.push({ code: "budget", key: "fantasy.validation.budget", extra: { over: (cost - input.bank - budget).toFixed(1) } });

  return issues;
}

export interface FormationCheckInput {
  startingIds: string[]; // exactly 11
  players: FantasyPlayer[];
  formation: FormationKey;
}

export function validateFormation({ startingIds, players, formation }: FormationCheckInput): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const cfg = FORMATIONS[formation];
  const list = startingIds.map((id) => players.find((p) => p.id === id)).filter(Boolean) as FantasyPlayer[];
  const gk = list.filter((p) => p.position === "GK").length;
  const def = list.filter((p) => p.position === "DEF").length;
  const mid = list.filter((p) => p.position === "MID").length;
  const fwd = list.filter((p) => p.position === "FWD").length;
  if (gk !== 1 || def !== cfg.DEF || mid !== cfg.MID || fwd !== cfg.FWD) {
    issues.push({ code: "formation_invalid", key: "fantasy.validation.formation" });
  }
  return issues;
}

export function transferHitPoints(paidTransfers: number, hit = 4): number {
  return Math.max(0, paidTransfers) * hit;
}
