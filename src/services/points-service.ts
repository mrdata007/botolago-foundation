// Pure adapter that turns mock team/player/gameweek data into a stable
// UI view model derived from the Fantasy engine. All rules live in
// `fantasy-engine`; this file only maps inputs/outputs and persists
// finalized results per gameweek.

import type {
  FantasyPlayer,
  FantasyTeam,
  GameweekResult,
  PlayerPointsBreakdown,
} from "@/types/fantasy";
import {
  computeGameweekResult,
  resolveCaptainMultiplier,
  type ChipKey,
  type ChipsState,
} from "@/lib/fantasy-engine";

export interface PointsViewModel {
  gameweek: number;
  /** "engine" when derived from computeGameweekResult; "legacy_mock" when only totals exist. */
  source: "engine" | "legacy_mock";
  totalPoints: number;
  /** XI points including captain multiplier BEFORE the transfer hit is subtracted. */
  rawXiPoints: number;
  captainBonus: number;
  effectiveCaptainId: string | null;
  captainMultiplier: number;
  /** True when the vice-captain stepped in because the captain didn't play. */
  captainTookOver: boolean;
  originalBenchPoints: number;
  benchBoostContribution: number;
  tripleCaptainContribution: number;
  transferHitPoints: number;
  activeChip: ChipKey | null;
  effectiveStartingIds: string[];
  originalBenchIds: string[];
  autoSubs: { outId: string; inId: string; reasonKey: string }[];
  breakdown: PlayerPointsBreakdown[];
  averagePoints?: number | null;
  highestPoints?: number | null;
  /** ISO timestamp of the compute pass; used by callers for freshness UI. */
  computedAt: string;
  /** True when the gameweek has been closed by `finalizeGameweek`. */
  finalized?: boolean;
  /** ISO timestamp of the finalize call (present only when finalized). */
  finalizedAt?: string;
  /** Chip that was active at the moment of finalization (recorded for audit). */
  chipUsed?: ChipKey | null;
  /** Transfer hit points applied at finalization (recorded for audit). */
  hitPointsApplied?: number;
}

export interface BuildInputs {
  gameweek: number;
  team: FantasyTeam;
  players: FantasyPlayer[];
  chips: ChipsState;
  transferHitPoints: number;
  /** Provisional per-player events + minutes for the current GW. */
  breakdown: PlayerPointsBreakdown[];
  averagePoints?: number | null;
  highestPoints?: number | null;
}

/**
 * Build a deterministic view model for the given gameweek. If breakdown is
 * empty (e.g. historical mock rows), the caller should render legacy fallback
 * via `buildLegacyViewModel` instead.
 */
export function buildPointsViewModel(input: BuildInputs): PointsViewModel {
  const minutesById: Record<string, number> = {};
  input.breakdown.forEach((b) => {
    minutesById[b.playerId] = b.minutesPlayed;
  });

  const engine = computeGameweekResult({
    squad: input.team.squad,
    players: input.players,
    formation: input.team.formation,
    breakdown: input.breakdown,
    minutesById,
    chips: input.chips,
    transferHitPoints: input.transferHitPoints,
  });

  // Recover raw (pre-captain) totals per player.
  const rawById = new Map<string, number>();
  input.breakdown.forEach((b) => {
    const raw = b.isCaptain ? Math.round(b.totalPoints / 2) : b.totalPoints;
    rawById.set(b.playerId, raw);
  });
  const raw = (id: string) => rawById.get(id) ?? 0;

  const cap = resolveCaptainMultiplier({
    squad: input.team.squad,
    minutesById,
    tripleCaptainActive: input.chips.active === "triple_captain",
  });

  const originalBenchIds = input.team.squad
    .filter((s) => s.slot >= 12)
    .sort((a, b) => a.slot - b.slot)
    .map((s) => s.playerId);
  const originalStartingIds = input.team.squad
    .filter((s) => s.slot < 12)
    .sort((a, b) => a.slot - b.slot)
    .map((s) => s.playerId);

  const benchBoost = input.chips.active === "bench_boost";
  const benchBoostContribution = benchBoost
    ? originalBenchIds.reduce((s, id) => s + raw(id), 0)
    : 0;

  const capId = cap.captainId;
  const tripleCaptainContribution =
    input.chips.active === "triple_captain" && capId ? raw(capId) : 0;

  const rawXiPoints = engine.totalPoints + input.transferHitPoints;

  const captainDeclared = input.team.squad.find((s) => s.isCaptain)?.playerId ?? null;
  const captainTookOver = !!capId && !!captainDeclared && capId !== captainDeclared;

  return {
    gameweek: input.gameweek,
    source: "engine",
    totalPoints: engine.totalPoints,
    rawXiPoints,
    captainBonus: engine.captainBonus,
    effectiveCaptainId: capId,
    captainMultiplier: cap.multiplier,
    captainTookOver,
    originalBenchPoints: engine.benchPoints,
    benchBoostContribution,
    tripleCaptainContribution,
    transferHitPoints: input.transferHitPoints,
    activeChip: engine.chip,
    effectiveStartingIds: engine.effectiveStartingIds,
    originalBenchIds,
    autoSubs: engine.autoSubs,
    breakdown: input.breakdown,
    averagePoints: input.averagePoints,
    highestPoints: input.highestPoints,
    computedAt: new Date().toISOString(),
  };
}

/** Fallback view model for historical mock rows that lack a breakdown. */
export function buildLegacyViewModel(
  gw: GameweekResult,
  originalBenchIds: string[],
  originalStartingIds: string[],
): PointsViewModel {
  return {
    gameweek: gw.gameweek,
    source: "legacy_mock",
    totalPoints: gw.totalPoints,
    rawXiPoints: gw.totalPoints,
    captainBonus: 0,
    effectiveCaptainId: gw.captainId ?? null,
    captainMultiplier: 1,
    captainTookOver: false,
    originalBenchPoints: gw.benchPoints,
    benchBoostContribution: 0,
    tripleCaptainContribution: 0,
    transferHitPoints: 0,
    activeChip: null,
    effectiveStartingIds: originalStartingIds,
    originalBenchIds,
    autoSubs: [],
    breakdown: gw.breakdown,
    averagePoints: gw.averagePoints,
    highestPoints: gw.highestPoints,
    computedAt: new Date().toISOString(),
  };
}
