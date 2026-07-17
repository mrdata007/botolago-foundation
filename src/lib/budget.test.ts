// Run with: `bun test src/lib/budget.test.ts`
import { describe, it, expect } from "bun:test";
import {
  computeBudgetImpact,
  sumPrices,
  transferHit,
  splitTransfers,
  maxAffordableReplacement,
} from "./budget";
import type { FantasyPlayer } from "@/types/fantasy";

const P = (id: string, price: number): FantasyPlayer => ({
  id,
  name: { fr: id, ar: id },
  clubId: "war",
  position: "MID",
  price,
  totalPoints: 0,
  form: 0,
  ownership: 0,
  status: "available",
});

describe("budget helpers", () => {
  it("sumPrices sums with 1-decimal rounding", () => {
    expect(sumPrices([P("a", 5.1), P("b", 4.2)])).toBe(9.3);
    expect(sumPrices([])).toBe(0);
  });

  it("computeBudgetImpact flags over-budget", () => {
    const r = computeBudgetImpact({
      outPlayers: [P("o", 5.0)],
      inPlayers: [P("i", 8.5)],
      bank: 1.4,
    });
    expect(r.delta).toBe(-3.5);
    expect(r.bankAfter).toBe(-2.1);
    expect(r.overBudget).toBe(true);
  });

  it("computeBudgetImpact accepts even swap", () => {
    const r = computeBudgetImpact({
      outPlayers: [P("o", 7.0)],
      inPlayers: [P("i", 7.0)],
      bank: 0,
    });
    expect(r.delta).toBe(0);
    expect(r.bankAfter).toBe(0);
    expect(r.overBudget).toBe(false);
  });

  it("computeBudgetImpact frees money when swapping down", () => {
    const r = computeBudgetImpact({
      outPlayers: [P("o", 9.0)],
      inPlayers: [P("i", 6.5)],
      bank: 0.5,
    });
    expect(r.delta).toBe(2.5);
    expect(r.bankAfter).toBe(3.0);
    expect(r.overBudget).toBe(false);
  });

  it("transferHit: free transfers cost nothing", () => {
    expect(transferHit(0)).toBe(0);
    expect(transferHit(2)).toBe(8);
    expect(transferHit(-3)).toBe(0);
  });

  it("splitTransfers separates free vs paid", () => {
    expect(splitTransfers(3, 1)).toEqual({ free: 1, paid: 2 });
    expect(splitTransfers(1, 2)).toEqual({ free: 1, paid: 0 });
    expect(splitTransfers(0, 1)).toEqual({ free: 0, paid: 0 });
  });

  it("maxAffordableReplacement", () => {
    expect(maxAffordableReplacement(6.5, 1.4)).toBe(7.9);
  });
});
