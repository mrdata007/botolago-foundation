import { describe, expect, it } from "bun:test";
import type { FantasyRules } from "./contracts";
import {
  calculateTransferCost,
  rollFreeTransfers,
  validateFantasySquad,
  type SquadCandidate,
} from "./rules";

const rules: FantasyRules = {
  squadSize: 15,
  budget: 100,
  maxPlayersPerClub: 3,
  initialFreeTransfers: 1,
  maxFreeTransferRollover: 2,
  transferHitCost: 4,
  captainMultiplier: 2,
  tripleCaptainMultiplier: 3,
  positions: [
    { position: "GK", squadQuota: 2, startingMinimum: 1, startingMaximum: 1 },
    { position: "DEF", squadQuota: 5, startingMinimum: 3, startingMaximum: 5 },
    { position: "MID", squadQuota: 5, startingMinimum: 2, startingMaximum: 5 },
    { position: "FWD", squadQuota: 3, startingMinimum: 1, startingMaximum: 3 },
  ],
};

function squad(): SquadCandidate[] {
  const positions = [
    "GK",
    "GK",
    "DEF",
    "DEF",
    "DEF",
    "DEF",
    "DEF",
    "MID",
    "MID",
    "MID",
    "MID",
    "MID",
    "FWD",
    "FWD",
    "FWD",
  ] as const;
  return positions.map((position, index) => ({
    id: `p${index}`,
    clubId: `c${Math.floor(index / 3)}`,
    position,
    price: 6,
    eligible: true,
    active: true,
  }));
}

function lineup() {
  const starters = [0, 2, 3, 4, 5, 7, 8, 9, 10, 12, 13];
  const bench = [1, 6, 11, 14];
  return [
    ...starters.map((index, order) => ({
      playerId: `p${index}`,
      slot: "starter" as const,
      order: order + 1,
      captain: index === 7,
      viceCaptain: index === 12,
    })),
    ...bench.map((index, order) => ({
      playerId: `p${index}`,
      slot: "bench" as const,
      order: order + 1,
      captain: false,
      viceCaptain: false,
    })),
  ];
}

describe("Fantasy rules", () => {
  it("accepts a valid deterministic squad and formation", () => {
    expect(validateFantasySquad(squad(), lineup(), rules)).toEqual({
      valid: true,
      errors: [],
      totalCost: 90,
    });
  });

  it("rejects duplicate, ineligible, budget and club-limit violations", () => {
    const players = squad();
    players[14] = { ...players[0]!, price: 20, eligible: false };
    const result = validateFantasySquad(players, lineup(), rules);
    expect(result.valid).toBeFalse();
    expect(result.errors).toContain("duplicate_player");
    expect(result.errors).toContain("player_not_eligible");
    expect(result.errors).toContain("budget_exceeded");
    expect(result.errors).toContain("club_limit_exceeded");
  });

  it("calculates hits and chip exceptions server-equivalently", () => {
    expect(
      calculateTransferCost({ transferCount: 3, freeTransfers: 1, hitCost: 4, chip: null }),
    ).toEqual({ freeTransfersUsed: 1, pointHit: 8 });
    expect(
      calculateTransferCost({ transferCount: 15, freeTransfers: 2, hitCost: 4, chip: "wildcard" }),
    ).toEqual({ freeTransfersUsed: 0, pointHit: 0 });
    expect(
      calculateTransferCost({ transferCount: 15, freeTransfers: 2, hitCost: 4, chip: "free_hit" }),
    ).toEqual({ freeTransfersUsed: 0, pointHit: 0 });
  });

  it("caps free-transfer rollover", () => {
    expect(rollFreeTransfers(0, rules)).toBe(1);
    expect(rollFreeTransfers(1, rules)).toBe(2);
    expect(rollFreeTransfers(2, rules)).toBe(2);
  });
});
