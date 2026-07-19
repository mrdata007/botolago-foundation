// Pure transfer application service. UI never encodes transfer rules — it
// calls `previewTransfers` for the review breakdown and `applyConfirmedTransfers`
// to derive the next persisted team + chips state. Wildcard / Free Hit /
// deadline / hit-point rules are centralized here so tests can pin them and
// a future backend can reuse this module.

import {
  computeTransferCost,
  evaluateDeadline,
  type ChipsState,
  type DeadlineState,
} from "@/lib/fantasy-engine";
import type { FantasyTeam, SquadPlayer } from "@/types/fantasy";

// ---------- Preview (review breakdown) ----------

export interface TransfersPreviewInput {
  team: Pick<FantasyTeam, "squad" | "bank" | "freeTransfers" | "formation">;
  chips: ChipsState;
  outIds: string[];
  inIds: string[];
  /** Net bank cost of the pending in↔out swap. */
  netCost: number;
}

export interface TransfersPreview {
  totalTransfers: number;
  free: number;
  paid: number;
  hitPoints: number;
  bankAfter: number;
  chipActive: "wildcard" | "free_hit" | null;
  overBudget: boolean;
  /** freeTransfers persisted after confirmation. */
  freeTransfersAfter: number;
}

export function previewTransfers(input: TransfersPreviewInput): TransfersPreview {
  const totalTransfers = Math.min(input.outIds.length, input.inIds.length);
  const wildcardActive = input.chips.active === "wildcard";
  const freeHitActive = input.chips.active === "free_hit";
  const cost = computeTransferCost({
    totalTransfers,
    freeTransfers: input.team.freeTransfers,
    wildcardActive,
    freeHitActive,
  });
  const bankAfter = Math.round((input.team.bank - input.netCost) * 10) / 10;
  // While Wildcard or Free Hit is active, free transfers are not consumed —
  // Wildcard grants unlimited transfers and Free Hit reverts everything.
  const freeTransfersAfter =
    wildcardActive || freeHitActive
      ? input.team.freeTransfers
      : Math.max(0, input.team.freeTransfers - totalTransfers);
  return {
    totalTransfers,
    free: cost.free,
    paid: cost.paid,
    hitPoints: cost.hitPoints,
    bankAfter,
    chipActive: wildcardActive ? "wildcard" : freeHitActive ? "free_hit" : null,
    overBudget: bankAfter < 0,
    freeTransfersAfter,
  };
}

// ---------- Confirmation (apply + snapshot) ----------

export interface ApplyTransfersInput {
  team: FantasyTeam;
  chips: ChipsState;
  outIds: string[];
  inIds: string[];
  netCost: number;
  deadlineIso?: string;
  now?: Date;
}

export interface AppliedTransfers {
  nextSquad: SquadPlayer[];
  nextBank: number;
  nextFreeTransfers: number;
  pendingTransfers: number;
  hitPointsApplied: number;
  chips: ChipsState;
  /** True when the confirmation captured the Free Hit snapshot on this call. */
  freeHitSnapshotTaken: boolean;
}

export type TransferError = "deadline_passed" | "over_budget" | "no_changes" | "unequal_in_out";

/** Result union — errors carry a stable machine key that maps to an i18n string. */
export type ApplyResult =
  | { ok: true; value: AppliedTransfers }
  | { ok: false; error: TransferError };

export function applyConfirmedTransfers(input: ApplyTransfersInput): ApplyResult {
  if (input.outIds.length !== input.inIds.length) {
    return { ok: false, error: "unequal_in_out" };
  }
  const totalTransfers = input.outIds.length;
  if (totalTransfers === 0) return { ok: false, error: "no_changes" };

  if (input.deadlineIso) {
    const dl = evaluateDeadline(input.deadlineIso, input.now);
    if (dl.isLocked) return { ok: false, error: "deadline_passed" };
  }

  const wildcardActive = input.chips.active === "wildcard";
  const freeHitActive = input.chips.active === "free_hit";

  const cost = computeTransferCost({
    totalTransfers,
    freeTransfers: input.team.freeTransfers,
    wildcardActive,
    freeHitActive,
  });

  const nextBank = Math.round((input.team.bank - input.netCost) * 10) / 10;
  if (nextBank < 0) return { ok: false, error: "over_budget" };

  const nextSquad = input.team.squad.map((sp) => {
    const idx = input.outIds.indexOf(sp.playerId);
    if (idx < 0) return sp;
    const inId = input.inIds[idx];
    if (!inId) return sp;
    return { ...sp, playerId: inId };
  });

  const nextFreeTransfers =
    wildcardActive || freeHitActive
      ? input.team.freeTransfers
      : Math.max(0, input.team.freeTransfers - totalTransfers);

  // Free Hit: snapshot the ORIGINAL squad on the first temporary mutation.
  // Subsequent Free Hit confirmations must never overwrite the snapshot.
  let chips = input.chips;
  let freeHitSnapshotTaken = false;
  if (freeHitActive && !input.chips.freeHitSnapshot) {
    chips = {
      ...input.chips,
      freeHitSnapshot: {
        squad: input.team.squad.map((s) => ({ ...s })),
        formation: input.team.formation,
        bank: input.team.bank,
        freeTransfers: input.team.freeTransfers,
      },
    };
    freeHitSnapshotTaken = true;
  }

  return {
    ok: true,
    value: {
      nextSquad,
      nextBank,
      nextFreeTransfers,
      pendingTransfers: totalTransfers,
      hitPointsApplied: cost.hitPoints,
      chips,
      freeHitSnapshotTaken,
    },
  };
}

// ---------- Deadline helper (re-export for UI convenience) ----------

export function transfersDeadline(iso: string | undefined, now?: Date): DeadlineState | null {
  if (!iso) return null;
  return evaluateDeadline(iso, now);
}
