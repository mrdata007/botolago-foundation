// Run with: `bun test src/services/transfers-sale-value.test.ts`
//
// FANT-01 / FANT-02 (audit 2026-10-14). The transfers screen used to credit a
// leaving player's MARKET price as cash, and said nothing when the server's
// preview failed. These tests pin the owner's sale value (the server's
// half-profit figure) and the reasons a preview can fail.
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { calculateSalePrice } from "@/backend/fantasy/pricing";
import {
  classifyPreviewFailure,
  draftBank,
  exceedsBudget,
  ownedSalePrice,
  replacementBudget,
  transferNetCost,
  transferPreviewPanel,
} from "./transfers-service";

// The audit's scenario: bought at 7.0, now 7.4, bank 0. The database sells him
// for 7.0 + floor(0.4 / 0.2) * 0.1 = 7.2 (app_private.fantasy_calculate_sale_price).
const SALE_PRICES = { owned: 7.2 };
const MARKET = 7.4;

describe("the sale value the screen credits (FANT-01)", () => {
  it("is the server's sale price, not the market price", () => {
    expect(ownedSalePrice(SALE_PRICES, "owned", MARKET)).toBe(7.2);
  });

  it("falls back to the market price only when the snapshot has no sale price", () => {
    expect(ownedSalePrice({}, "owned", MARKET)).toBe(MARKET);
    expect(ownedSalePrice(undefined, "owned", MARKET)).toBe(MARKET);
    expect(ownedSalePrice({ owned: 0 }, "owned", MARKET)).toBe(MARKET);
    expect(ownedSalePrice({ owned: Number.NaN }, "owned", MARKET)).toBe(MARKET);
  });

  it("keeps the server's figure when the price has fallen (sale = current price)", () => {
    // Bought at 7.0, now 6.8: the SQL returns the current price.
    expect(ownedSalePrice({ owned: 6.8 }, "owned", 6.8)).toBe(6.8);
  });

  it("the picker blocks the 7.3 replacement in the audit scenario (it did not before)", () => {
    // Replacing the owned player from a bank of 0, exactly as the route builds the budget.
    const budget = replacementBudget({
      draftBank: draftBank({ bank: 0, outValues: [], committedInPrices: [] }),
      leavingValue: ownedSalePrice(SALE_PRICES, "owned", MARKET),
      currentInPrice: 0,
    });
    expect(exceedsBudget(7.3, budget)).toBe(true);
    expect(exceedsBudget(7.2, budget)).toBe(false);
    // Credited at the market price, as the screen used to, the same row was offered.
    const oldBudget = replacementBudget({ draftBank: 0, leavingValue: MARKET, currentInPrice: 0 });
    expect(exceedsBudget(7.3, oldBudget)).toBe(false);
  });

  it("the audit scenario: the 7.3 replacement is not affordable with bank 0", () => {
    const bank = draftBank({
      bank: 0,
      outValues: [ownedSalePrice(SALE_PRICES, "owned", MARKET)],
      committedInPrices: [],
    });
    expect(bank).toBe(7.2);
    expect(7.3 > bank + 0.001).toBe(true);
    // The old credit (market price) would have offered it.
    const oldBank = draftBank({ bank: 0, outValues: [MARKET], committedInPrices: [] });
    expect(7.3 > oldBank + 0.001).toBe(false);
  });

  it("the replacement budget starts from the sale value of the player being replaced", () => {
    const budget = replacementBudget({
      draftBank: draftBank({ bank: 0, outValues: [], committedInPrices: [] }),
      leavingValue: ownedSalePrice(SALE_PRICES, "owned", MARKET),
      currentInPrice: 0,
    });
    expect(budget).toBe(7.2);
    expect(7.2 > budget + 0.001).toBe(false);
    expect(7.3 > budget + 0.001).toBe(true);
  });

  it("gives back the price of the player already pencilled in for the slot", () => {
    // Out: owned (sells 7.2); in: a 7.0 player. Bank 0.5.
    const bank = draftBank({ bank: 0.5, outValues: [7.2], committedInPrices: [7.0] });
    expect(bank).toBe(0.7);
    // Re-picking for that same slot: his 7.0 comes back, the sale value is already counted.
    expect(replacementBudget({ draftBank: bank, leavingValue: 0, currentInPrice: 7.0 })).toBe(7.7);
  });

  it("handles several transfers at once with rounding to tenths", () => {
    const sale = { a: 5.2, b: 6.1, c: 4.4 };
    const bank = draftBank({
      bank: 0.3,
      outValues: [sale.a, sale.b, sale.c],
      committedInPrices: [5.3, 6.4],
    });
    expect(bank).toBe(4.3);
    expect(transferNetCost([5.3, 6.4, 4.5], [sale.a, sale.b, sale.c])).toBeCloseTo(0.5, 10);
  });

  it("net cost of the audit swap is 0.1 over a bank of 0", () => {
    const net = transferNetCost([7.3], [7.2]);
    expect(Math.round((0 - net) * 10) / 10).toBe(-0.1);
  });
});

// The mirror of the SQL rule exists once in the app (src/backend/fantasy/pricing.ts);
// these pin it to the SQL: purchase + floor((current - purchase) / 0.2) * 0.1,
// or the current price when it has not risen.
describe("the half-profit rule behind the server's sale price", () => {
  const cases: Array<[number, number, number]> = [
    [7.0, 7.4, 7.2], // the audit example
    [7.0, 7.1, 7.0], // 0.1 rise: nothing retained
    [7.0, 7.2, 7.1], // 0.2 rise: 0.1 retained
    [7.0, 7.3, 7.1], // odd step: rounds down
    [7.0, 7.5, 7.2], // 0.5 rise: 0.2 retained
    [7.0, 7.0, 7.0], // no change
    [7.0, 6.8, 6.8], // price fell: sale = current
  ];
  for (const [purchase, current, expected] of cases) {
    it(`bought ${purchase}, now ${current} sells for ${expected}`, () => {
      expect(calculateSalePrice(purchase, current)).toBe(expected);
    });
  }
});

describe("why a preview did not come back (FANT-02)", () => {
  const err = (code: string, domainCode?: string, message = "") => ({ code, domainCode, message });

  it("reads each authoritative refusal as a reason", () => {
    expect(classifyPreviewFailure(err("mfa_required"), null).kind).toBe("step_up");
    expect(classifyPreviewFailure(err("version_conflict"), null).kind).toBe("stale");
    expect(classifyPreviewFailure(err("network"), null).kind).toBe("network");
    expect(classifyPreviewFailure(err("gameweek_locked"), null).kind).toBe("locked");
    expect(classifyPreviewFailure(err("permission_denied"), null).kind).toBe("permission");
    expect(classifyPreviewFailure(err("unknown"), null).kind).toBe("generic");
    expect(classifyPreviewFailure(new Error("boom"), null).kind).toBe("generic");
    expect(classifyPreviewFailure(undefined, null).kind).toBe("generic");
  });

  it("a budget refusal carries the real shortfall when it can be sized", () => {
    expect(classifyPreviewFailure(err("validation", "budget_exceeded"), 0.1)).toEqual({
      kind: "budget",
      shortfall: 0.1,
    });
  });

  it("a budget refusal with nothing missing on our figures does not invent an amount", () => {
    expect(classifyPreviewFailure(err("validation", "budget_exceeded"), null)).toEqual({
      kind: "budget",
      shortfall: null,
    });
    expect(classifyPreviewFailure(err("validation", "budget_exceeded"), 0)).toEqual({
      kind: "budget",
      shortfall: null,
    });
  });

  const base = {
    isCloud: true,
    completePairs: 1,
    pendingOutWithoutIn: false,
    queryEnabled: true,
    isFetching: false,
    hasData: false,
    error: null as unknown,
    shortfall: null as number | null,
  };

  it("says nothing when there is nothing to compute or the preview is in", () => {
    expect(transferPreviewPanel({ ...base, completePairs: 0 })).toEqual({ state: "none" });
    expect(transferPreviewPanel({ ...base, pendingOutWithoutIn: true })).toEqual({ state: "none" });
    expect(transferPreviewPanel({ ...base, hasData: true })).toEqual({ state: "none" });
  });

  it("shows an explicit pending state while the server computes", () => {
    expect(transferPreviewPanel({ ...base, isFetching: true })).toEqual({ state: "pending" });
  });

  it("shows the reason and offers a retry when the preview fails", () => {
    const panel = transferPreviewPanel({ ...base, error: err("network") });
    expect(panel).toEqual({
      state: "failed",
      issue: { kind: "network", shortfall: null },
      retryable: true,
    });
  });

  it("keeps showing the failure (not the pending state) once the retry settles with an error", () => {
    expect(transferPreviewPanel({ ...base, error: err("mfa_required") }).state).toBe("failed");
    expect(
      transferPreviewPanel({ ...base, error: err("mfa_required"), isFetching: true }).state,
    ).toBe("pending");
  });

  it("a passed deadline has no retry", () => {
    const panel = transferPreviewPanel({ ...base, error: err("gameweek_locked") });
    expect(panel.state === "failed" && panel.retryable).toBe(false);
  });

  it("never leaves Next disabled in silence when the preview was not even asked for", () => {
    const panel = transferPreviewPanel({ ...base, queryEnabled: false });
    expect(panel.state).toBe("failed");
    expect(panel.state === "failed" && panel.issue.kind).toBe("generic");
  });

  it("local mode: an over-budget draft names the shortfall, with nothing to retry", () => {
    expect(transferPreviewPanel({ ...base, isCloud: false, shortfall: 0.1 })).toEqual({
      state: "failed",
      issue: { kind: "budget", shortfall: 0.1 },
      retryable: false,
    });
    expect(transferPreviewPanel({ ...base, isCloud: false, shortfall: null })).toEqual({
      state: "none",
    });
  });
});

// The route is too heavy to render here, so its wiring is pinned at the source:
// the places the audit found crediting the market price (FANT-01) and the
// notice that must sit beside "Suivant" (FANT-02).
describe("the transfers route is wired to the owner's sale value and the notice", () => {
  const source = readFileSync(join(import.meta.dir, "../routes/fantasy.transfers.tsx"), "utf8");

  it("never credits, labels or passes the market price as the selling price", () => {
    expect(source).not.toContain("soldPrice: pickerOut.price");
    expect(source).not.toMatch(/key: "sell"[\s\S]{0,120}nf\.format\(p\.price\)/);
    expect(source).not.toContain("const freedValue");
    expect(source).toContain("ownedSalePrice(owned.snapshot?.salePrices");
    expect(source).toContain("soldPrice: valueOut(pickerOut.id)");
  });

  it("renders the preview notice and keeps the retry away from the draft", () => {
    expect(source).toContain("<TransferPreviewNotice");
    const retry = source.slice(
      source.indexOf("const retryPreview"),
      source.indexOf("// ---- Interactions"),
    );
    expect(retry).toContain("serverPreview.refetch()");
    expect(retry).not.toContain("setOutIds");
    expect(retry).not.toContain("setInIds");
    expect(retry).not.toContain("reset(");
  });
});
