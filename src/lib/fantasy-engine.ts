// Pure Fantasy rules engine. UI never encodes rules — it calls these
// functions. A future backend can reuse this module verbatim.

import type {
  FantasyPlayer,
  FantasyTeam,
  FormationKey,
  PlayerPointsBreakdown,
  Position,
  SquadPlayer,
} from "@/types/fantasy";
import { FORMATIONS, SQUAD_RULES } from "@/types/fantasy";

// ---------- Chips ----------

export type ChipKey = "bench_boost" | "triple_captain" | "wildcard" | "free_hit";
export type ChipState = "available" | "active" | "used" | "unavailable";

export interface ChipsState {
  active: ChipKey | null;
  used: ChipKey[];
  /** Squad snapshot taken when Free Hit is activated — restored after GW. */
  freeHitSnapshot?: {
    squad: SquadPlayer[];
    formation: FormationKey;
    bank: number;
    freeTransfers: number;
  };
  /** Wildcard flag: unlimited free transfers for the active window. */
  wildcardActiveForGW?: number;
}

export const DEFAULT_CHIPS: ChipsState = { active: null, used: [] };

/** Only one chip may be active per gameweek; already-used chips cannot repeat. */
export function canActivateChip(
  state: ChipsState,
  key: ChipKey,
  opts: { deadlinePassed: boolean },
): { ok: boolean; reasonKey?: string } {
  if (opts.deadlinePassed) return { ok: false, reasonKey: "fantasy.engine.deadline_passed" };
  if (state.used.includes(key)) return { ok: false, reasonKey: "fantasy.engine.chip_used" };
  if (state.active && state.active !== key)
    return { ok: false, reasonKey: "fantasy.engine.chip_conflict" };
  return { ok: true };
}

export function activateChip(
  state: ChipsState,
  key: ChipKey,
  ctx: { gameweek: number; team: FantasyTeam },
): ChipsState {
  const next: ChipsState = { ...state, active: key };
  if (key === "wildcard") next.wildcardActiveForGW = ctx.gameweek;
  if (key === "free_hit") {
    next.freeHitSnapshot = {
      squad: ctx.team.squad.map((s) => ({ ...s })),
      formation: ctx.team.formation,
      bank: ctx.team.bank,
      freeTransfers: ctx.team.freeTransfers,
    };
  }
  return next;
}

/**
 * Cancel an active chip BEFORE the deadline. Semantics:
 * - The chip returns to `available` — it is NOT added to `used`.
 * - Any Free Hit snapshot is discarded (nothing to restore).
 * - Any wildcard-active marker is cleared.
 * A used chip is produced ONLY by `finalizeChip` (gameweek finalization).
 */
export function deactivateChip(state: ChipsState): ChipsState {
  if (!state.active) return state;
  return {
    ...state,
    active: null,
    freeHitSnapshot: undefined,
    wildcardActiveForGW: undefined,
  };
}

/**
 * Finalize the currently active chip: it becomes `used` (dedup so repeated
 * finalization is idempotent), active is cleared, and the wildcard-active
 * marker is cleared. `freeHitSnapshot` is preserved on the returned state so
 * the caller can consume it separately for team reversion.
 */
export function finalizeChip(state: ChipsState): ChipsState {
  if (!state.active) return state;
  const key = state.active;
  const used = state.used.includes(key) ? state.used : [...state.used, key];
  return {
    ...state,
    active: null,
    used,
    wildcardActiveForGW: undefined,
  };
}

/** Restore squad after Free Hit expires. Returns the snapshot (or null). */
export function consumeFreeHitSnapshot(state: ChipsState): {
  state: ChipsState;
  snapshot: ChipsState["freeHitSnapshot"];
} {
  const snapshot = state.freeHitSnapshot;
  return { state: { ...state, freeHitSnapshot: undefined }, snapshot };
}

export function chipDisplayState(state: ChipsState, key: ChipKey): ChipState {
  if (state.active === key) return "active";
  if (state.used.includes(key)) return "used";
  return "available";
}

// ---------- Captain assignment ----------

/** Set captain (and clear captain flag from anyone else). */
export function setCaptain(squad: SquadPlayer[], playerId: string): SquadPlayer[] {
  return squad.map((s) => ({
    ...s,
    isCaptain: s.playerId === playerId,
    isViceCaptain: s.isViceCaptain && s.playerId !== playerId,
  }));
}

export function setViceCaptain(squad: SquadPlayer[], playerId: string): SquadPlayer[] {
  return squad.map((s) => ({
    ...s,
    isViceCaptain: s.playerId === playerId,
    isCaptain: s.isCaptain && s.playerId !== playerId,
  }));
}

// ---------- Captain multiplier ----------

/**
 * Choose the effective captain given who played and the chip state.
 * Returns `{ captainId, multiplier }` — multiplier is 3 if Triple Captain is
 * active and the captain played, 2 if captain played, otherwise vice steps in
 * with multiplier 2 (1 if Triple Captain but vice doesn't get the boost per
 * standard rules; we intentionally cap vice at 2 to match user expectations).
 * If neither played, multiplier is 1 (no bonus).
 */
export function resolveCaptainMultiplier(args: {
  squad: SquadPlayer[];
  minutesById: Record<string, number>;
  tripleCaptainActive: boolean;
}): { captainId: string | null; multiplier: number } {
  const cap = args.squad.find((s) => s.isCaptain);
  const vc = args.squad.find((s) => s.isViceCaptain);
  const playedCap = cap && (args.minutesById[cap.playerId] ?? 0) > 0;
  const playedVc = vc && (args.minutesById[vc.playerId] ?? 0) > 0;
  if (playedCap) return { captainId: cap!.playerId, multiplier: args.tripleCaptainActive ? 3 : 2 };
  if (playedVc) return { captainId: vc!.playerId, multiplier: 2 };
  return { captainId: null, multiplier: 1 };
}

// ---------- Automatic substitutions ----------

export interface AutoSubInput {
  squad: SquadPlayer[]; // 15 with slot order (bench 12..15)
  players: FantasyPlayer[];
  formation: FormationKey;
  /** Minutes played per player in the settled gameweek. */
  minutesById: Record<string, number>;
}

export interface AutoSubResult {
  /** IDs of the effective starting XI after auto-subs. */
  startingIds: string[];
  /** Ordered list of subs performed. */
  subs: { outId: string; inId: string; reasonKey: string }[];
}

const OUTFIELD: Position[] = ["DEF", "MID", "FWD"];

function posOf(players: FantasyPlayer[], id: string): Position | undefined {
  return players.find((p) => p.id === id)?.position;
}

/** Would the current outfield counts satisfy `formation`? */
function isLegal(counts: Record<Position, number>, formation: FormationKey): boolean {
  const cfg = FORMATIONS[formation];
  return (
    counts.GK === 1 &&
    counts.DEF >= 3 &&
    counts.FWD >= 1 &&
    counts.DEF + counts.MID + counts.FWD === 10 &&
    // exact match preferred but the auto-sub may change formation implicitly;
    // we accept any legal FPL-style structure here.
    counts.DEF <= 5 &&
    counts.MID <= 5 &&
    counts.FWD <= 3 &&
    cfg !== undefined
  ); // keeps formation referenced
}

/**
 * Compute auto-substitutions. Rules:
 * - A starter with 0 minutes may be replaced by the first eligible bench player.
 * - Goalkeeper only swapped with bench goalkeeper (slot 12).
 * - Outfield replacements iterate the bench in slot order and pick the first
 *   that preserves a legal outfield distribution.
 */
export function computeAutoSubs(input: AutoSubInput): AutoSubResult {
  const startingIds = input.squad
    .filter((s) => s.slot < 12)
    .sort((a, b) => a.slot - b.slot)
    .map((s) => s.playerId);
  const bench = input.squad
    .filter((s) => s.slot >= 12)
    .sort((a, b) => a.slot - b.slot)
    .map((s) => s.playerId);
  const played = (id: string) => (input.minutesById[id] ?? 0) > 0;
  const subs: AutoSubResult["subs"] = [];

  // Track current XI positions
  const idsXI = [...startingIds];
  const counts: Record<Position, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  idsXI.forEach((id) => {
    const p = posOf(input.players, id);
    if (p) counts[p]++;
  });
  const benchQueue = [...bench];

  for (let i = 0; i < idsXI.length; i++) {
    const outId = idsXI[i];
    if (played(outId)) continue;
    const outPos = posOf(input.players, outId);
    if (!outPos) continue;

    if (outPos === "GK") {
      // Only bench GK (slot 12) may replace, and only if they played.
      const gkIdx = benchQueue.findIndex((id) => posOf(input.players, id) === "GK");
      if (gkIdx < 0) continue;
      const inId = benchQueue[gkIdx];
      if (!played(inId)) continue;
      benchQueue.splice(gkIdx, 1);
      idsXI[i] = inId;
      subs.push({ outId, inId, reasonKey: "fantasy.engine.sub.gk" });
      continue;
    }

    // Outfield: iterate bench in order; skip GK; require played + legal.
    const legalIdx = benchQueue.findIndex((id) => {
      const pos = posOf(input.players, id);
      if (!pos || pos === "GK") return false;
      if (!played(id)) return false;
      const trial: Record<Position, number> = { ...counts };
      trial[outPos] -= 1;
      trial[pos] += 1;
      return isLegal(trial, input.formation);
    });
    if (legalIdx < 0) continue;
    const inId = benchQueue[legalIdx];
    const inPos = posOf(input.players, inId)!;
    benchQueue.splice(legalIdx, 1);
    idsXI[i] = inId;
    counts[outPos]--;
    counts[inPos]++;
    subs.push({ outId, inId, reasonKey: "fantasy.engine.sub.outfield" });
  }

  return { startingIds: idsXI, subs };
}

// ---------- Legal outfield swap (during editing) ----------

/**
 * Would swapping `aId` into starting XI and `bId` onto the bench preserve a
 * legal formation? For manual on-the-fly edits before deadline.
 */
export function isLegalSwap(args: {
  squad: SquadPlayer[];
  players: FantasyPlayer[];
  formation: FormationKey;
  aId: string; // currently XI or bench
  bId: string;
}): boolean {
  const posA = posOf(args.players, args.aId);
  const posB = posOf(args.players, args.bId);
  if (!posA || !posB) return false;
  // Same-position swap always legal.
  if (posA === posB) return true;
  // GKs can only swap with GK.
  if (posA === "GK" || posB === "GK") return false;
  // Recompute post-swap XI counts.
  const inXI = new Set(args.squad.filter((s) => s.slot < 12).map((s) => s.playerId));
  const aInXI = inXI.has(args.aId);
  const bInXI = inXI.has(args.bId);
  if (aInXI === bInXI) return false; // swap only meaningful across the divide.
  const counts: Record<Position, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  args.squad
    .filter((s) => s.slot < 12)
    .forEach((s) => {
      const p = posOf(args.players, s.playerId);
      if (p) counts[p]++;
    });
  const bringIn = aInXI ? posB : posA;
  const takeOut = aInXI ? posA : posB;
  const trial: Record<Position, number> = { ...counts };
  trial[takeOut] -= 1;
  trial[bringIn] += 1;
  return isLegal(trial, args.formation);
}

// ---------- Transfer costs ----------

export function computeTransferCost(args: {
  totalTransfers: number;
  freeTransfers: number;
  wildcardActive?: boolean;
  freeHitActive?: boolean;
}): { free: number; paid: number; hitPoints: number } {
  if (args.wildcardActive || args.freeHitActive) {
    return { free: args.totalTransfers, paid: 0, hitPoints: 0 };
  }
  const free = Math.min(args.totalTransfers, Math.max(0, args.freeTransfers));
  const paid = Math.max(0, args.totalTransfers - free);
  return { free, paid, hitPoints: paid * SQUAD_RULES.transferHitPoints };
}

// ---------- Deadline lock ----------

export interface DeadlineState {
  iso: string;
  isLocked: boolean;
  msRemaining: number;
}

export function evaluateDeadline(iso: string, now: Date = new Date()): DeadlineState {
  const target = new Date(iso).getTime();
  const msRemaining = target - now.getTime();
  return { iso, isLocked: msRemaining <= 0, msRemaining };
}

// ---------- Gameweek scoring summary ----------

export interface ScoringInput {
  squad: SquadPlayer[];
  players: FantasyPlayer[];
  formation: FormationKey;
  breakdown: PlayerPointsBreakdown[]; // pre-multiplier raw points per player
  minutesById: Record<string, number>;
  chips: ChipsState;
  transferHitPoints: number;
}

export interface ScoringResult {
  totalPoints: number;
  benchPoints: number;
  captainBonus: number;
  hitPoints: number;
  chip: ChipKey | null;
  autoSubs: AutoSubResult["subs"];
  effectiveStartingIds: string[];
}

/** Combine engine sub-modules to compute the definitive gameweek result. */
export function computeGameweekResult(input: ScoringInput): ScoringResult {
  const benchBoost = input.chips.active === "bench_boost";
  const tripleCap = input.chips.active === "triple_captain";
  const auto = computeAutoSubs(input);

  // Base per-player raw totals (strip existing captain multiplier from mock breakdown).
  const rawById = new Map<string, number>();
  input.breakdown.forEach((b) => {
    const isCap = !!b.isCaptain;
    const raw = isCap ? Math.round(b.totalPoints / 2) : b.totalPoints;
    rawById.set(b.playerId, raw);
  });
  const raw = (id: string) => rawById.get(id) ?? 0;

  const xiIds = benchBoost
    ? [
        ...auto.startingIds,
        ...input.squad
          .filter((s) => s.slot >= 12)
          .map((s) => s.playerId)
          .filter((id) => !auto.startingIds.includes(id)),
      ]
    : auto.startingIds;
  const benchSlotIds = input.squad.filter((s) => s.slot >= 12).map((s) => s.playerId);

  const cap = resolveCaptainMultiplier({
    squad: input.squad,
    minutesById: input.minutesById,
    tripleCaptainActive: tripleCap,
  });
  const capId = cap.captainId;
  const capMult = cap.multiplier;

  let xiPoints = 0;
  xiIds.forEach((id) => {
    const base = raw(id);
    xiPoints += id === capId ? base * capMult : base;
  });
  // Bench points are always the informational sum of original bench slot raw points.
  const benchPoints = benchSlotIds.reduce((s, id) => s + raw(id), 0);
  const captainBonus = capId ? raw(capId) * (capMult - 1) : 0;

  return {
    totalPoints: xiPoints - input.transferHitPoints,
    benchPoints,
    captainBonus,
    hitPoints: input.transferHitPoints,
    chip: input.chips.active,
    autoSubs: auto.subs,
    effectiveStartingIds: xiIds,
  };
}
