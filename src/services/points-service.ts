// Pure adapter that turns mock team/player/gameweek data into a stable
// UI view model derived from the Fantasy engine. All rules live in
// `fantasy-engine`; this file only maps inputs/outputs and persists
// finalized results per gameweek.

import type { FantasyPointsDto } from "@/backend/fantasy/contracts";
import type {
  FantasyPlayer,
  FantasyTeam,
  GameweekResult,
  PointsEventKind,
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
  /** Whether totals come from the local engine, V2 backend, or legacy mock fallback. */
  source: "engine" | "authoritative" | "legacy_mock";
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
  averagePoints?: number;
  highestPoints?: number;
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

function autoSubReasonKey(reason: string): string {
  return reason === "goalkeeper_did_not_play"
    ? "fantasy.engine.sub.gk"
    : "fantasy.engine.sub.outfield";
}

function pointEventKind(
  category: FantasyPointsDto["players"][number]["events"][number]["category"],
): PointsEventKind {
  if (category === "goals_conceded") return "conceded";
  if (category === "yellow_card") return "yellow";
  if (category === "red_card" || category === "second_yellow_dismissal") return "red";
  return category;
}

/** Maps the owner-scoped V2 points DTO into the route-level domain model. */
export function mapFantasyPointsDto(
  sequence: number,
  dto: FantasyPointsDto,
): GameweekResult | undefined {
  if (!dto.result) return undefined;
  const captain =
    dto.players.find((player) => player.multiplier > 1) ??
    dto.players.find((player) => player.captain);
  return {
    gameweek: sequence,
    totalPoints: dto.result.finalScore ?? dto.result.provisionalScore,
    benchPoints: dto.result.benchPoints,
    startingPoints: dto.result.startingPoints,
    captainPoints: dto.result.captainPoints,
    transferHitPoints: dto.result.transferHit,
    activeChip: dto.result.chipType ?? undefined,
    finalized: dto.result.state === "final",
    finalizedAt: dto.result.finalizedAt ?? undefined,
    captainId: captain?.fantasyPlayerId,
    autoSubs: dto.autoSubs.map((substitution) => {
      const reasonKey = autoSubReasonKey(substitution.reason);
      return {
        outId: substitution.playerOutId,
        inId: substitution.playerInId,
        reason: { fr: reasonKey, ar: reasonKey },
      };
    }),
    breakdown: dto.players.map((player) => {
      const basePoints = player.finalPoints ?? player.provisionalPoints;
      return {
        playerId: player.fantasyPlayerId,
        totalPoints: basePoints * player.multiplier,
        multiplier: player.multiplier,
        minutesPlayed: player.minutesPlayed,
        isCaptain: player.captain || undefined,
        isViceCaptain: player.viceCaptain || undefined,
        isBench: player.slot === "bench" || undefined,
        status: dto.pointsState === "final" ? "final" : "provisional",
        events: player.events.map((event) => ({
          kind: pointEventKind(event.category),
          points: event.points,
          count: event.count,
        })),
      };
    }),
  };
}

export interface BuildInputs {
  gameweek: number;
  team: FantasyTeam;
  players: FantasyPlayer[];
  chips: ChipsState;
  transferHitPoints: number;
  /** Provisional per-player events + minutes for the current GW. */
  breakdown: PlayerPointsBreakdown[];
  averagePoints?: number;
  highestPoints?: number;
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

/**
 * Maps an already-calculated V2 result without running the local scoring
 * engine. The server total, transfer hit, chip, and player multipliers remain
 * authoritative for current and historical gameweeks.
 */
export function buildAuthoritativePointsViewModel(gw: GameweekResult): PointsViewModel {
  const originalBenchIds = gw.breakdown
    .filter((player) => player.isBench)
    .map((player) => player.playerId);
  const originalStartingIds = gw.breakdown
    .filter((player) => !player.isBench)
    .map((player) => player.playerId);
  const substitutionsByOut = new Map(
    gw.autoSubs.map((substitution) => [substitution.outId, substitution.inId]),
  );
  const effectiveStartingIds = originalStartingIds.map(
    (playerId) => substitutionsByOut.get(playerId) ?? playerId,
  );
  const effectiveCaptain =
    gw.breakdown.find((player) => (player.multiplier ?? 0) > 1) ??
    gw.breakdown.find((player) => player.playerId === gw.captainId);
  const declaredCaptain = gw.breakdown.find((player) => player.isCaptain);
  const captainMultiplier = effectiveCaptain?.multiplier ?? (effectiveCaptain ? 2 : 1);
  const captainBasePoints =
    effectiveCaptain && captainMultiplier > 0
      ? Math.round(effectiveCaptain.totalPoints / captainMultiplier)
      : 0;
  const transferHitPoints = gw.transferHitPoints ?? 0;
  const activeChip = gw.activeChip ?? null;

  return {
    gameweek: gw.gameweek,
    source: "authoritative",
    totalPoints: gw.totalPoints,
    rawXiPoints: gw.totalPoints + transferHitPoints,
    captainBonus: gw.captainPoints ?? captainBasePoints * (captainMultiplier - 1),
    effectiveCaptainId: effectiveCaptain?.playerId ?? null,
    captainMultiplier,
    captainTookOver:
      !!declaredCaptain &&
      !!effectiveCaptain &&
      declaredCaptain.playerId !== effectiveCaptain.playerId,
    originalBenchPoints: gw.benchPoints,
    benchBoostContribution: activeChip === "bench_boost" ? gw.benchPoints : 0,
    tripleCaptainContribution: activeChip === "triple_captain" ? captainBasePoints : 0,
    transferHitPoints,
    activeChip,
    effectiveStartingIds,
    originalBenchIds,
    autoSubs: gw.autoSubs.map((substitution) => ({
      outId: substitution.outId,
      inId: substitution.inId,
      reasonKey: substitution.reason.fr,
    })),
    breakdown: gw.breakdown,
    averagePoints: gw.averagePoints,
    highestPoints: gw.highestPoints,
    computedAt: gw.finalizedAt ?? new Date().toISOString(),
    finalized: gw.finalized,
    finalizedAt: gw.finalizedAt,
    chipUsed: gw.finalized ? activeChip : undefined,
    hitPointsApplied: gw.finalized ? transferHitPoints : undefined,
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
