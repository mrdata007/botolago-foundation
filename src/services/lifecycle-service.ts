// Gameweek lifecycle service. Two backend-replaceable operations built from
// the pure fantasy-engine primitives:
//   - finalizeGameweek: close the current GW, snapshot the engine result,
//     move the active chip into `used`, restore the Free Hit team, clear
//     transient transfer state. Idempotent for a given gameweek.
//   - advanceGameweek:  requires the current GW to be finalized, increments
//     `currentGameweek`, rolls free transfers (cap 2), clears the transfer
//     hit and pending transfer count.  Idempotent when the target already
//     matches the persisted currentGameweek.
//
// The service is UI-agnostic and the caller passes the freshly-loaded
// team/players/breakdown so we don't reach into async data sources here.

import type {
  FantasyPlayer,
  FantasyTeam,
  PlayerPointsBreakdown,
} from "@/types/fantasy";
import {
  consumeFreeHitSnapshot,
  finalizeChip,
  type ChipsState,
} from "@/lib/fantasy-engine";
import {
  buildPointsViewModel,
  type PointsViewModel,
} from "@/services/points-service";
import { fantasyStateStore } from "@/services/fantasy-state";
import { fantasyService, type FantasyTeamPatch } from "@/services/fantasy-mock";

// ---------- finalizeGameweek ----------

export interface FinalizeInput {
  gameweek: number;
  team: FantasyTeam;
  players: FantasyPlayer[];
  breakdown: PlayerPointsBreakdown[];
  averagePoints?: number;
  highestPoints?: number;
}

export interface FinalizeOutput {
  result: PointsViewModel;
  /** false when the call was a no-op because the GW was already finalized. */
  changed: boolean;
  /** true when finalize consumed a Free Hit snapshot and restored the team. */
  freeHitRestored: boolean;
  chipsAfter: ChipsState;
}

export function finalizeGameweek(input: FinalizeInput): FinalizeOutput {
  const state = fantasyStateStore.read();
  const existing = state.results[input.gameweek];
  if (existing?.finalized) {
    return {
      result: existing,
      changed: false,
      freeHitRestored: false,
      chipsAfter: state.chips,
    };
  }

  const vm0 = buildPointsViewModel({
    gameweek: input.gameweek,
    team: input.team,
    players: input.players,
    chips: state.chips,
    transferHitPoints: state.transferHitPoints,
    breakdown: input.breakdown,
    averagePoints: input.averagePoints,
    highestPoints: input.highestPoints,
  });

  const chipUsed = state.chips.active;
  const hitPointsApplied = state.transferHitPoints;
  const finalizedAt = new Date().toISOString();
  const vm: PointsViewModel = {
    ...vm0,
    finalized: true,
    finalizedAt,
    chipUsed,
    hitPointsApplied,
  };

  // Team reversion: Free Hit restores its exact pre-mutation snapshot.
  // Wildcard and other chips keep the mutated team.
  let teamPatch: FantasyTeamPatch = { pendingTransfers: 0 };
  let freeHitRestored = false;
  if (chipUsed === "free_hit" && state.chips.freeHitSnapshot) {
    const snap = state.chips.freeHitSnapshot;
    teamPatch = {
      squad: snap.squad,
      formation: snap.formation,
      bank: snap.bank,
      freeTransfers: snap.freeTransfers,
      pendingTransfers: 0,
    };
    freeHitRestored = true;
  }

  // Move the active chip into `used` (idempotent) and drop the snapshot.
  const chipsAfter = consumeFreeHitSnapshot(finalizeChip(state.chips)).state;

  fantasyStateStore.write({
    chips: chipsAfter,
    results: { ...state.results, [input.gameweek]: vm },
  });
  fantasyService.saveTeam(teamPatch);

  return { result: vm, changed: true, freeHitRestored, chipsAfter };
}

// ---------- advanceGameweek ----------

export interface AdvanceInput {
  targetGameweek: number;
  team: FantasyTeam;
}

export type AdvanceError = "must_finalize_first" | "target_in_past";

export interface AdvanceOutput {
  ok: true;
  changed: boolean;
  nextFreeTransfers: number;
}

export type AdvanceResult = AdvanceOutput | { ok: false; error: AdvanceError };

/**
 * Free transfers roll one week: previous + 1, capped at 2. Wildcard and Free
 * Hit weeks do not consume free transfers, so the same +1 / cap-2 rule applies
 * to them (documented rule; matches classic FPL rollover).
 */
export function rollFreeTransfers(previous: number): number {
  return Math.min(2, Math.max(0, previous) + 1);
}

export function advanceGameweek(input: AdvanceInput): AdvanceResult {
  const state = fantasyStateStore.read();
  const cur = state.currentGameweek;

  // Idempotent no-op: same-target advance after it already ran.
  if (input.targetGameweek === cur) {
    return { ok: true, changed: false, nextFreeTransfers: input.team.freeTransfers };
  }
  if (input.targetGameweek < cur) {
    return { ok: false, error: "target_in_past" };
  }

  const curResult = state.results[cur];
  if (!curResult?.finalized) return { ok: false, error: "must_finalize_first" };

  const nextFT = rollFreeTransfers(input.team.freeTransfers);
  fantasyStateStore.write({
    currentGameweek: input.targetGameweek,
    transferHitPoints: 0,
  });
  fantasyService.saveTeam({ freeTransfers: nextFT, pendingTransfers: 0 });

  return { ok: true, changed: true, nextFreeTransfers: nextFT };
}

// ---------- Query helpers ----------

export function isGameweekFinalized(gw: number): boolean {
  return !!fantasyStateStore.read().results[gw]?.finalized;
}
