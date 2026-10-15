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
import type { FantasyPlayer, FantasyTeam, SquadPlayer } from "@/types/fantasy";

// ---------- The saved transfer draft (SOL-01) ----------

/**
 * A pencilled-in transfer as it is kept on the device: who leaves and, if
 * chosen, who comes in for him. Pairs are saved whole, so a leaver whose
 * replacement is not chosen yet stays a placeholder, in its own place, and the
 * second replacement can never slide up against the first leaver.
 */
export interface TransfersDraftPayload {
  v: 2;
  pairs: Array<{ outId: string; inId: string | null }>;
}

export interface ParsedTransfersDraft {
  outIds: string[];
  inIds: (string | null)[];
}

/** The draft as the screen holds it (two lists, `inIds[i]` is `outIds[i]`'s replacement) to its saved form. */
export function serializeTransfersDraft(
  outIds: readonly string[],
  inIds: ReadonlyArray<string | null | undefined>,
): TransfersDraftPayload {
  return { v: 2, pairs: outIds.map((outId, index) => ({ outId, inId: inIds[index] || null })) };
}

const isId = (value: unknown): value is string => typeof value === "string" && value.length > 0;

/**
 * Reads a saved draft back, or `null` when there is nothing safe to restore.
 * Never trusts the payload: it is only ever a convenience, and the server
 * re-checks every transfer when it is previewed and confirmed.
 *
 * Old format (`{ outIds, inIds }`): its incoming list was saved with the
 * unfilled places removed. With both lists the same length nothing was
 * removed and the pairing by place is exact. With fewer incoming ids than
 * leavers the pairing is unknowable (`out[A,B] in[null,X]` was saved as
 * `in[X]`), so the leavers are kept as unfilled placeholders and the incoming
 * ids are dropped: the manager picks them again, and nothing is paired wrongly.
 */
export function parseTransfersDraft(
  payload: unknown,
  options: { squadIds?: ReadonlySet<string> } = {},
): ParsedTransfersDraft | null {
  if (!payload || typeof payload !== "object") return null;
  const raw = payload as {
    v?: unknown;
    pairs?: unknown;
    outIds?: unknown;
    inIds?: unknown;
  };
  let pairs: Array<{ outId: string; inId: string | null }>;
  if (raw.v === 2) {
    if (!Array.isArray(raw.pairs)) return null;
    pairs = [];
    for (const item of raw.pairs as unknown[]) {
      if (!item || typeof item !== "object") return null;
      const { outId, inId } = item as { outId?: unknown; inId?: unknown };
      if (!isId(outId) || !(inId === null || isId(inId))) return null;
      pairs.push({ outId, inId });
    }
  } else if (raw.v === undefined && Array.isArray(raw.outIds) && Array.isArray(raw.inIds)) {
    const outs = raw.outIds as unknown[];
    const ins = raw.inIds as unknown[];
    if (!outs.every(isId) || !ins.every(isId)) return null;
    const aligned = ins.length === outs.length;
    pairs = outs.map((outId, index) => ({
      outId: outId as string,
      inId: aligned ? (ins[index] as string) : null,
    }));
  } else {
    return null;
  }

  const outIds: string[] = [];
  const inIds: (string | null)[] = [];
  const usedIn = new Set<string>();
  for (const pair of pairs) {
    if (outIds.includes(pair.outId)) continue;
    if (options.squadIds && !options.squadIds.has(pair.outId)) continue;
    const inId = pair.inId && pair.inId !== pair.outId && !usedIn.has(pair.inId) ? pair.inId : null;
    if (inId) usedIn.add(inId);
    outIds.push(pair.outId);
    inIds.push(inId);
  }
  return outIds.length === 0 ? null : { outIds, inIds };
}

// ---------- An owned player the buying pool does not list (SOL-02) ----------

/**
 * What the server's team record says about a player the manager owns:
 * identity, position, club and market price. The buying pool lists only active,
 * eligible players, so an owned player who has since become inactive or
 * ineligible is in the squad and NOT in the pool; the squad is the authority on
 * who is owned, the pool only on who may be bought.
 */
export interface OwnedPlayerRecord {
  id: string;
  clubId: string;
  position: FantasyPlayer["position"];
  price: number;
  status: string;
}

/** The pool's own mapping of a server status to the screens' four. */
function ownedStatus(status: string): FantasyPlayer["status"] {
  return status === "available" || status === "doubtful" || status === "suspended"
    ? status
    : "injured";
}

/**
 * An owned player as the screen can draw and sell him. The server's team record
 * carries no name, so the caller passes the wording to show in its place. His
 * sale value stays the server's `salePrices` figure (`ownedSalePrice`).
 */
export function ownedPlayerFallback(
  record: OwnedPlayerRecord,
  name: FantasyPlayer["name"],
): FantasyPlayer {
  return {
    id: record.id,
    name,
    clubId: record.clubId,
    position: record.position,
    price: record.price,
    totalPoints: 0,
    form: null,
    ownership: 0,
    status: ownedStatus(record.status),
    photoUrl: null,
  };
}

/**
 * Every player the transfers screen must be able to look up: the buying pool
 * plus the owned players it does not list. Use it to RESOLVE players (squad
 * slots, sale values, the preview); hand the picker the pool alone, so an
 * owned player who left the pool can be sold but never bought.
 */
export function resolveKnownPlayers(
  pool: FantasyPlayer[],
  owned: Readonly<Record<string, OwnedPlayerRecord>> | undefined,
  name: FantasyPlayer["name"],
): FantasyPlayer[] {
  if (!owned) return pool;
  const inPool = new Set(pool.map((player) => player.id));
  const extra = Object.values(owned)
    .filter((record) => !inPool.has(record.id))
    .map((record) => ownedPlayerFallback(record, name));
  return extra.length === 0 ? pool : [...pool, ...extra];
}

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
  | "invalid"
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
  // The server looked at this transfer and said no (invalid_transfer, club_limit_exceeded,
  // invalid_squad, player_not_eligible, chip_unavailable, ...): not a hiccup.
  if (e.code === "validation" || e.code === "not_found") {
    return { kind: "invalid", shortfall: null };
  }
  return { kind: "generic", shortfall: null };
}

export type TransferPreviewPanel =
  | { state: "none" }
  | { state: "pending" }
  | { state: "failed"; issue: TransferPreviewIssue; retryable: boolean };

/** Only a failure that can pass on its own, or by the manager's action, is worth asking again. */
function isRetryable(issue: TransferPreviewIssue): boolean {
  switch (issue.kind) {
    case "network":
    case "step_up":
    case "stale":
    case "generic":
      return true;
    // Prices may simply have moved: asking again means something when no amount is known.
    case "budget":
      return issue.shortfall === null;
    // A final answer (deadline, access, an invalid transfer): another try says the same.
    case "locked":
    case "permission":
    case "invalid":
      return false;
  }
}

/**
 * Whether "Suivant" may be pressed. One rule for the route and its tests: the
 * draft is complete and open, it fits the budget, and (in the cloud) the
 * server's preview is in and not failed.
 */
export function canContinueTransfers(input: {
  completePairs: number;
  pendingOutWithoutIn: boolean;
  locked: boolean;
  overBudget: boolean;
  isCloud: boolean;
  hasData: boolean;
  isError: boolean;
}): boolean {
  return (
    input.completePairs > 0 &&
    !input.pendingOutWithoutIn &&
    !input.locked &&
    !input.overBudget &&
    (!input.isCloud || (input.hasData && !input.isError))
  );
}

/**
 * What the transfers screen says about the server's preview. `none` only when
 * there is nothing to compute or the preview is in; every other reason Next is
 * held back is `pending` or `failed`, so the button is never grey without a
 * sentence beside it. A failed refetch over earlier data counts as a failure:
 * React Query keeps the old data, and `canContinueTransfers` holds Next back.
 *
 * `shortfall` is the amount missing worked out from the owner's sale values
 * (null when the draft fits).
 */
export function transferPreviewPanel(input: {
  isCloud: boolean;
  completePairs: number;
  pendingOutWithoutIn: boolean;
  queryEnabled: boolean;
  locked: boolean;
  isFetching: boolean;
  hasData: boolean;
  error: unknown;
  shortfall: number | null;
}): TransferPreviewPanel {
  if (input.completePairs === 0 || input.pendingOutWithoutIn) return { state: "none" };
  if (input.locked) {
    return { state: "failed", issue: { kind: "locked", shortfall: null }, retryable: false };
  }
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
  // The error comes before the data: a refetch that fails keeps the earlier answer.
  if (input.error) {
    if (input.isFetching) return { state: "pending" };
    const issue = classifyPreviewFailure(input.error, input.shortfall);
    return { state: "failed", issue, retryable: isRetryable(issue) };
  }
  if (input.hasData) return { state: "none" };
  if (input.isFetching) return { state: "pending" };
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
