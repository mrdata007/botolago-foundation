// Pass 3.2-H6 — Cloud-authoritative finalize & advance planners.
//
// Pure helpers that turn a `FantasySnapshot` into the exact payload the
// cloud repository needs, without touching `fantasyStateStore`, network,
// or React state. Route code uses these to:
//
//   1. `selectStableCloudResult` — short-circuit re-visits of a gameweek
//      that the server has already finalized. When it returns a value the
//      client MUST NOT call `finalizeGameweek` again.
//   2. `buildCloudFinalizationPlan` — build the finalize RPC payload
//      (result, chipFinalize, postTeam, postPurchasePrices, nextLifecycle)
//      with Free Hit restore and de-duplicated chip `used`.
//   3. `buildCloudAdvancePlan` — build the `saveTeam` payload that
//      advances the current gameweek: rolls free transfers, points at the
//      resolved next-GW UUID, preserves chip lifecycle & purchase prices.
//
// Nothing here reads or writes any local store. The plans are deterministic
// functions of their inputs, so unit tests exercise every branch without a
// running app.

import type { FantasyPlayer, SquadPlayer, FormationKey } from "@/types/fantasy";
import type { PointsViewModel } from "@/services/points-service";
import { buildPointsViewModel } from "@/services/points-service";
import type { FantasyPersistedState } from "@/services/fantasy-state";
import type { FantasySnapshot } from "@/services/fantasy-owned-repository";
import {
  consumeFreeHitSnapshot,
  finalizeChip,
  type ChipKey,
  type ChipsState,
} from "@/lib/fantasy-engine";
import { rollFreeTransfers } from "@/services/lifecycle-service";

// ---------- selectStableCloudResult ----------

/**
 * Return the finalized `PointsViewModel` for `gw` if the server-authoritative
 * snapshot already contains one. Callers use this to short-circuit before
 * invoking the finalize RPC.
 *
 * Prefers `snapshot.finalizedResults[gw]` (the canonical map from the cloud
 * repo, which only contains finalized entries) and falls back to
 * `snapshot.lifecycle.results[gw]` in case a repo variant only exposes the
 * lifecycle map. Never falls back to `fantasyStateStore`.
 */
export function selectStableCloudResult(
  snapshot: FantasySnapshot | null | undefined,
  gw: number,
): PointsViewModel | null {
  if (!snapshot) return null;
  const primary = snapshot.finalizedResults?.[gw];
  if (primary?.finalized) return primary;
  const secondary = snapshot.lifecycle?.results?.[gw];
  if (secondary?.finalized) return secondary;
  return null;
}

// ---------- buildCloudFinalizationPlan ----------

export interface CloudFinalizationPlanInput {
  snapshot: FantasySnapshot;
  gw: number;
  players: FantasyPlayer[];
  breakdown: PointsViewModel["breakdown"];
  averagePoints?: number;
  highestPoints?: number;
  /** Optional deterministic clock for tests. */
  now?: () => string;
}

export interface CloudFinalizationPlan {
  /** When non-null, caller MUST skip the finalize RPC. */
  skipReason: "already_finalized" | null;
  /** Finalized view model — either the existing one or a freshly built one. */
  result: PointsViewModel;
  chipFinalize: ChipKey | null;
  postTeam: {
    formation: FormationKey;
    bank: number;
    freeTransfers: number;
    pendingTransfers: number;
    squad: SquadPlayer[];
  };
  postPurchasePrices: Record<string, number>;
  nextLifecycle: FantasyPersistedState;
  /** True when this plan restores the pre–Free-Hit team. */
  freeHitRestored: boolean;
}

export function buildCloudFinalizationPlan(
  input: CloudFinalizationPlanInput,
): CloudFinalizationPlan {
  const { snapshot, gw } = input;
  const lifecycle = snapshot.lifecycle;

  // Short-circuit: server has already finalized this GW.
  const existing = selectStableCloudResult(snapshot, gw);
  if (existing) {
    return {
      skipReason: "already_finalized",
      result: existing,
      chipFinalize: existing.chipUsed ?? null,
      postTeam: {
        formation: snapshot.team.formation,
        bank: snapshot.team.bank,
        freeTransfers: snapshot.team.freeTransfers,
        pendingTransfers: snapshot.team.pendingTransfers,
        squad: snapshot.team.squad,
      },
      postPurchasePrices: snapshot.purchasePrices,
      nextLifecycle: lifecycle,
      freeHitRestored: false,
    };
  }

  const now = input.now ?? (() => new Date().toISOString());

  const vm0 = buildPointsViewModel({
    gameweek: gw,
    team: snapshot.team,
    players: input.players,
    chips: lifecycle.chips,
    transferHitPoints: lifecycle.transferHitPoints,
    breakdown: input.breakdown,
    averagePoints: input.averagePoints,
    highestPoints: input.highestPoints,
  });

  const chipFinalize: ChipKey | null = lifecycle.chips.active ?? null;
  const hitPointsApplied = lifecycle.transferHitPoints;
  const result: PointsViewModel = {
    ...vm0,
    finalized: true,
    finalizedAt: now(),
    chipUsed: chipFinalize,
    hitPointsApplied,
  };

  // De-duplicate used[] via engine helper and drop any freeHitSnapshot.
  const finalizedChips: ChipsState = consumeFreeHitSnapshot(
    finalizeChip(lifecycle.chips),
  ).state;

  // Free Hit restore: revert squad/formation/bank/freeTransfers to the
  // pre-mutation snapshot and re-install the pre-Free-Hit purchase prices.
  let postTeam = {
    formation: snapshot.team.formation,
    bank: snapshot.team.bank,
    freeTransfers: snapshot.team.freeTransfers,
    pendingTransfers: 0,
    squad: snapshot.team.squad,
  };
  let postPurchasePrices: Record<string, number> = snapshot.purchasePrices;
  let freeHitRestored = false;

  if (chipFinalize === "free_hit" && lifecycle.chips.freeHitSnapshot) {
    const snap = lifecycle.chips.freeHitSnapshot;
    postTeam = {
      formation: snap.formation,
      bank: snap.bank,
      freeTransfers: snap.freeTransfers,
      pendingTransfers: 0,
      squad: snap.squad,
    };
    // Purchase prices captured at Free Hit activation, if provided.
    if (snap.purchasePrices && Object.keys(snap.purchasePrices).length > 0) {
      postPurchasePrices = snap.purchasePrices;
    }
    freeHitRestored = true;
  }

  const nextLifecycle: FantasyPersistedState = {
    ...lifecycle,
    chips: finalizedChips,
    results: { ...lifecycle.results, [gw]: result },
    transferHitPoints: 0,
  };

  return {
    skipReason: null,
    result,
    chipFinalize,
    postTeam,
    postPurchasePrices,
    nextLifecycle,
    freeHitRestored,
  };
}

// ---------- buildCloudAdvancePlan ----------

export interface CloudAdvancePlanInput {
  snapshot: FantasySnapshot;
  /** Numeric next gameweek (e.g. `currentGameweek + 1`). */
  nextGameweekNumber: number;
  /** Resolved live UUID for the next gameweek. Never null. */
  nextGameweekId: string;
}

export type CloudAdvancePlanError =
  | "must_finalize_first"
  | "already_advanced"
  | "target_in_past";

export type CloudAdvancePlan =
  | {
      ok: true;
      /** Ready-to-send saveTeam input (minus teamName/managerName filled by caller). */
      nextFreeTransfers: number;
      nextLifecycle: FantasyPersistedState;
      postTeam: {
        formation: FormationKey;
        bank: number;
        freeTransfers: number;
        pendingTransfers: number;
        squad: SquadPlayer[];
      };
      postPurchasePrices: Record<string, number>;
      currentGameweekId: string;
      expectedVersion: number;
    }
  | { ok: false; error: CloudAdvancePlanError };

export function buildCloudAdvancePlan(
  input: CloudAdvancePlanInput,
): CloudAdvancePlan {
  const { snapshot, nextGameweekNumber, nextGameweekId } = input;
  const lifecycle = snapshot.lifecycle;
  const cur = lifecycle.currentGameweek;

  if (nextGameweekNumber === cur) return { ok: false, error: "already_advanced" };
  if (nextGameweekNumber < cur) return { ok: false, error: "target_in_past" };

  const curResult = lifecycle.results[cur];
  if (!curResult?.finalized) return { ok: false, error: "must_finalize_first" };

  const nextFreeTransfers = rollFreeTransfers(snapshot.team.freeTransfers);
  const nextLifecycle: FantasyPersistedState = {
    ...lifecycle,
    currentGameweek: nextGameweekNumber,
    transferHitPoints: 0,
  };

  return {
    ok: true,
    nextFreeTransfers,
    nextLifecycle,
    postTeam: {
      formation: snapshot.team.formation,
      bank: snapshot.team.bank,
      freeTransfers: nextFreeTransfers,
      pendingTransfers: 0,
      squad: snapshot.team.squad,
    },
    postPurchasePrices: snapshot.purchasePrices,
    currentGameweekId: nextGameweekId,
    expectedVersion: snapshot.version,
  };
}
