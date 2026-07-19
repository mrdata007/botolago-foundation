// Pure budget helpers for fantasy transfers. Kept dependency-free and
// deterministic so they are trivial to test and reuse across screens.

import type { FantasyPlayer } from "@/types/fantasy";
import { SQUAD_RULES } from "@/types/fantasy";

export interface BudgetImpact {
  outCost: number;
  inCost: number;
  delta: number; // positive = money freed (players out cost more than in)
  bankAfter: number;
  overBudget: boolean;
}

/** Sum of prices for a list of players. Rounded to 1 decimal for money display. */
export function sumPrices(players: FantasyPlayer[]): number {
  return round1(players.reduce((s, p) => s + p.price, 0));
}

/** Compute the effect of a transfer set on the current bank. */
export function computeBudgetImpact(args: {
  outPlayers: FantasyPlayer[];
  inPlayers: FantasyPlayer[];
  bank: number;
}): BudgetImpact {
  const outCost = sumPrices(args.outPlayers);
  const inCost = sumPrices(args.inPlayers);
  const delta = round1(outCost - inCost);
  const bankAfter = round1(args.bank + delta);
  return {
    outCost,
    inCost,
    delta,
    bankAfter,
    overBudget: bankAfter < -1e-6,
  };
}

/** Points hit for paid transfers. Free transfers cost 0. */
export function transferHit(
  paidTransfers: number,
  hitPerTransfer = SQUAD_RULES.transferHitPoints,
): number {
  return Math.max(0, paidTransfers) * hitPerTransfer;
}

/** Split a batch of transfers into free vs paid buckets. */
export function splitTransfers(totalTransfers: number, freeTransfers: number) {
  const free = Math.min(totalTransfers, Math.max(0, freeTransfers));
  const paid = Math.max(0, totalTransfers - free);
  return { free, paid };
}

/** Maximum player price the manager can afford as a replacement. */
export function maxAffordableReplacement(outPlayerPrice: number, bank: number): number {
  return round1(outPlayerPrice + bank);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
