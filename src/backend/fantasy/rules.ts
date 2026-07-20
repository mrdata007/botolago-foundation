import type { FantasyChip, FantasyPosition, FantasyRules } from "./contracts";

export interface SquadCandidate {
  readonly id: string;
  readonly clubId: string;
  readonly position: FantasyPosition;
  readonly price: number;
  readonly eligible: boolean;
  readonly active: boolean;
}

export interface LineupCandidate {
  readonly playerId: string;
  readonly slot: "starter" | "bench";
  readonly order: number;
  readonly captain: boolean;
  readonly viceCaptain: boolean;
}

export type SquadValidationCode =
  | "invalid_squad"
  | "duplicate_player"
  | "player_not_eligible"
  | "budget_exceeded"
  | "club_limit_exceeded"
  | "invalid_formation"
  | "captain_invalid"
  | "vice_captain_invalid"
  | "bench_order_invalid";

export interface SquadValidationResult {
  readonly valid: boolean;
  readonly errors: readonly SquadValidationCode[];
  readonly totalCost: number;
}

export function validateFantasySquad(
  squad: readonly SquadCandidate[],
  lineup: readonly LineupCandidate[],
  rules: FantasyRules,
): SquadValidationResult {
  const errors = new Set<SquadValidationCode>();
  const ids = squad.map((player) => player.id);
  const totalCost = roundMoney(squad.reduce((sum, player) => sum + player.price, 0));
  if (squad.length !== rules.squadSize || lineup.length !== rules.squadSize)
    errors.add("invalid_squad");
  if (
    new Set(ids).size !== ids.length ||
    new Set(lineup.map((item) => item.playerId)).size !== lineup.length
  )
    errors.add("duplicate_player");
  if (squad.some((player) => !player.active || !player.eligible)) errors.add("player_not_eligible");
  if (totalCost > rules.budget) errors.add("budget_exceeded");

  const clubCounts = countBy(squad, (player) => player.clubId);
  if ([...clubCounts.values()].some((count) => count > rules.maxPlayersPerClub))
    errors.add("club_limit_exceeded");

  const starters = lineup.filter((item) => item.slot === "starter");
  const bench = lineup.filter((item) => item.slot === "bench");
  if (starters.length !== 11) errors.add("invalid_formation");
  if (
    !isExactOrder(
      starters.map((item) => item.order),
      11,
    ) ||
    !isExactOrder(
      bench.map((item) => item.order),
      4,
    )
  )
    errors.add("bench_order_invalid");
  const squadById = new Map(squad.map((player) => [player.id, player]));
  for (const rule of rules.positions) {
    const squadCount = squad.filter((player) => player.position === rule.position).length;
    const startingCount = starters.filter(
      (item) => squadById.get(item.playerId)?.position === rule.position,
    ).length;
    if (squadCount !== rule.squadQuota) errors.add("invalid_squad");
    if (startingCount < rule.startingMinimum || startingCount > rule.startingMaximum)
      errors.add("invalid_formation");
  }
  const captain = lineup.filter((item) => item.captain);
  const vice = lineup.filter((item) => item.viceCaptain);
  if (captain.length !== 1 || captain[0]?.slot !== "starter") errors.add("captain_invalid");
  if (vice.length !== 1 || vice[0]?.slot !== "starter") errors.add("vice_captain_invalid");
  if (captain[0]?.playerId === vice[0]?.playerId) {
    errors.add("captain_invalid");
    errors.add("vice_captain_invalid");
  }
  return { valid: errors.size === 0, errors: [...errors], totalCost };
}

export interface TransferCostInput {
  readonly transferCount: number;
  readonly freeTransfers: number;
  readonly hitCost: number;
  readonly chip: FantasyChip | null;
}

export function calculateTransferCost(input: TransferCostInput) {
  const unlimited = input.chip === "wildcard" || input.chip === "free_hit";
  const freeUsed = unlimited ? 0 : Math.min(input.transferCount, input.freeTransfers);
  return {
    freeTransfersUsed: freeUsed,
    pointHit: unlimited ? 0 : Math.max(input.transferCount - freeUsed, 0) * input.hitCost,
  } as const;
}

export function rollFreeTransfers(
  current: number,
  rules: Pick<FantasyRules, "initialFreeTransfers" | "maxFreeTransferRollover">,
): number {
  return Math.min(rules.maxFreeTransferRollover, current + rules.initialFreeTransfers);
}

export interface ChipAllocationRule {
  readonly allocationCode: string;
  readonly chip: FantasyChip;
  readonly startsAtGameweek: number;
  readonly endsAtGameweek: number | null;
}

export function resolveChipAllocation(
  chip: FantasyChip,
  gameweek: number,
  publishedWildcardSplit: number | null,
  allocations: readonly ChipAllocationRule[],
): ChipAllocationRule | null {
  if (!Number.isInteger(gameweek) || gameweek <= 0) return null;
  return (
    allocations.find((allocation) => {
      if (allocation.chip !== chip) return false;
      const start =
        allocation.allocationCode === "wildcard_2" && publishedWildcardSplit !== null
          ? publishedWildcardSplit + 1
          : allocation.startsAtGameweek;
      const end =
        allocation.allocationCode === "wildcard_1" && publishedWildcardSplit !== null
          ? publishedWildcardSplit
          : allocation.endsAtGameweek;
      return gameweek >= start && (end === null || gameweek <= end);
    }) ?? null
  );
}

export function freeTransfersAfterGameweek(
  current: number,
  chip: FantasyChip | null,
  rules: Pick<FantasyRules, "initialFreeTransfers" | "maxFreeTransferRollover">,
): number {
  if (chip === "wildcard" || chip === "free_hit") return rules.initialFreeTransfers;
  return rollFreeTransfers(current, rules);
}

function countBy<T>(values: readonly T[], key: (value: T) => string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(key(value), (counts.get(key(value)) ?? 0) + 1);
  return counts;
}

function isExactOrder(values: readonly number[], length: number): boolean {
  return (
    [...values].sort((a, b) => a - b).every((value, index) => value === index + 1) &&
    values.length === length
  );
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
