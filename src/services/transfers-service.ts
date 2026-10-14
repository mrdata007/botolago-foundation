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

// ---------- Sale value of an owned player ----------

/** Money in the game moves in tenths: every sum is rounded the way the bank is. */
const roundTenth = (value: number) => Math.round(value * 10) / 10;

/**
 * What the owner of a player gets when he leaves: the SERVER's sale price for
 * that membership (`current_sale_price`, the half-profit rule of
 * FANTASY_RULES_V1 applied by the database), not the market price. A player
 * who has risen since he was bought sells for less than he now costs.
 *
 * This never works the figure out itself. When the snapshot carries no sale
 * price for the player (the guest/local adapters, whose purchase price is the
 * current price anyway) the market price stands in. The server previews and
 * confirms with its own figures either way; this is for the screen's display
 * and its affordability filter only.
 */
export function ownedSalePrice(
  salePrices: Readonly<Record<string, number>> | undefined,
  playerId: string,
  marketPrice: number,
): number {
  const sale = salePrices?.[playerId];
  return typeof sale === "number" && Number.isFinite(sale) && sale > 0 ? sale : marketPrice;
}

/** Net bank cost of the swaps: what comes in minus what the leavers sell for. */
export function transferNetCost(inPrices: readonly number[], outValues: readonly number[]): number {
  const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);
  return sum(inPrices) - sum(outValues);
}

/**
 * The bank the picker offers: the current bank plus the sale value of every
 * player marked out (replaced or not yet), minus the price of every player
 * already chosen to come in.
 */
export function draftBank(input: {
  bank: number;
  outValues: readonly number[];
  committedInPrices: readonly number[];
}): number {
  return roundTenth(
    input.bank +
      input.outValues.reduce((total, value) => total + value, 0) -
      input.committedInPrices.reduce((total, value) => total + value, 0),
  );
}

/**
 * What one replacement may cost. `leavingValue` is the sale value of the
 * player being replaced when he is not marked out yet (his value is not in the
 * draft bank); `currentInPrice` is the player already pencilled in for him,
 * whose price the picker gives back.
 */
export function replacementBudget(input: {
  draftBank: number;
  leavingValue: number;
  currentInPrice: number;
}): number {
  return roundTenth(input.draftBank + input.leavingValue + input.currentInPrice);
}

/**
 * The picker's affordability test: a player who costs more than the budget
 * (give or take float dust) is blocked on the row before the tap. One function,
 * so the picker and the tests read the same rule.
 */
export function exceedsBudget(price: number, budget: number): boolean {
  return price > budget + 0.001;
}

// ---------- Why a preview did not come back ----------

export type TransferPreviewIssueKind =
  | "budget"
  | "stale"
  | "step_up"
  | "network"
  | "locked"
  | "permission"
  | "generic";

export interface TransferPreviewIssue {
  kind: TransferPreviewIssueKind;
  /** The real amount missing, in millions, only when it is a budget refusal that we can size. */
  shortfall: number | null;
}

/**
 * Reads the authoritative refusal (a `FantasyRepoError`, or anything shaped
 * like one) into a reason the screen can say. Nothing here decides whether a
 * transfer is allowed: the server already did.
 */
export function classifyPreviewFailure(
  error: unknown,
  shortfall: number | null,
): TransferPreviewIssue {
  const e = (error ?? {}) as { code?: unknown; domainCode?: unknown; message?: unknown };
  const message = typeof e.message === "string" ? e.message : "";
  if (e.code === "mfa_required") return { kind: "step_up", shortfall: null };
  if (e.code === "version_conflict") return { kind: "stale", shortfall: null };
  if (e.code === "network") return { kind: "network", shortfall: null };
  if (e.code === "gameweek_locked") return { kind: "locked", shortfall: null };
  if (e.domainCode === "budget_exceeded" || /budget_exceeded/.test(message)) {
    return { kind: "budget", shortfall: shortfall !== null && shortfall > 0 ? shortfall : null };
  }
  if (e.code === "permission_denied" || e.code === "unauthenticated") {
    return { kind: "permission", shortfall: null };
  }
  return { kind: "generic", shortfall: null };
}

export type TransferPreviewPanel =
  | { state: "none" }
  | { state: "pending" }
  | { state: "failed"; issue: TransferPreviewIssue; retryable: boolean };

/**
 * What the transfers screen says about the server's preview. `none` only when
 * there is nothing to compute or the preview is in; every other reason Next is
 * held back is `pending` or `failed`, so the button is never grey without a
 * sentence beside it.
 *
 * `shortfall` is the amount missing worked out from the owner's sale values
 * (null when the draft fits).
 */
export function transferPreviewPanel(input: {
  isCloud: boolean;
  completePairs: number;
  pendingOutWithoutIn: boolean;
  queryEnabled: boolean;
  isFetching: boolean;
  hasData: boolean;
  error: unknown;
  shortfall: number | null;
}): TransferPreviewPanel {
  if (input.completePairs === 0 || input.pendingOutWithoutIn) return { state: "none" };
  if (!input.isCloud) {
    // Local/guest: no server, the screen's own figures are all there is.
    return input.shortfall !== null && input.shortfall > 0
      ? {
          state: "failed",
          issue: { kind: "budget", shortfall: input.shortfall },
          retryable: false,
        }
      : { state: "none" };
  }
  if (input.hasData) return { state: "none" };
  if (input.isFetching) return { state: "pending" };
  if (input.error) {
    const issue = classifyPreviewFailure(input.error, input.shortfall);
    return { state: "failed", issue, retryable: issue.kind !== "locked" };
  }
  // Not asked (no team or gameweek in the snapshot yet): say so rather than stay grey.
  if (!input.queryEnabled) {
    return { state: "failed", issue: { kind: "generic", shortfall: null }, retryable: true };
  }
  return { state: "pending" };
}

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
