import { describe, expect, it } from "bun:test";

import { LAUNCH_PRICES, type PremiumPrice } from "@/backend/premium/contracts";

import { daysUntil, seasonEndOf, seasonPriceOf } from "./plus-pricing";

describe("the Saison's price", () => {
  it("is 200 MAD, one purchase, no period, no renewal", () => {
    expect(seasonPriceOf()).toEqual({
      code: "plus_season",
      amountMad: 200,
      periodMonths: null,
      renews: false,
      validUntil: null,
    });
  });
  it("comes from the server's list when it has one, and falls back to the launch price", () => {
    const server: PremiumPrice[] = [{ ...LAUNCH_PRICES[0]!, amountMad: 250 }];
    expect(seasonPriceOf(server).amountMad).toBe(250);
    expect(seasonPriceOf([]).amountMad).toBe(200);
  });
  it("ends on the server's date, and on none until it is known", () => {
    expect(seasonEndOf()).toBeNull();
    const server: PremiumPrice[] = [
      { ...LAUNCH_PRICES[0]!, validUntil: "2027-05-31T20:00:00.000Z" },
    ];
    expect(seasonEndOf(server)?.toISOString()).toBe("2027-05-31T20:00:00.000Z");
  });
});

describe("days until", () => {
  it("counts calendar days", () => {
    expect(daysUntil(new Date(2026, 9, 14, 0, 1), new Date(2026, 9, 13, 23, 59))).toBe(1);
    expect(daysUntil(new Date(2026, 9, 13), new Date(2026, 9, 13, 8))).toBe(0);
  });
});
