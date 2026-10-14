import { describe, expect, it } from "bun:test";

import { derivePremium } from "@/services/use-premium";

import {
  LAUNCH_PRICES,
  MY_PREMIUM_OFF,
  PREMIUM_STATES,
  PREMIUM_STATUS_OFF,
  isMemberState,
  myPremiumSchema,
  premiumPriceSchema,
  premiumStatusSchema,
  premiumStatusWireSchema,
} from "./contracts";
import {
  MockPremiumRepository,
  PLUS_SCENARIOS,
  mockMine,
  scenarioFromSearch,
  type PlusScenario,
} from "./mock-repository";

const NOW = new Date("2026-10-13T10:00:00Z");
const context = { actorId: "u1", requestId: "r1" };

describe("contracts", () => {
  it("carry the owner's launch prices and parse as the server's list will", () => {
    expect(LAUNCH_PRICES.map((p) => [p.code, p.amountMad, p.periodMonths, p.renews])).toEqual([
      ["plus_monthly", 20, 1, true],
      ["plus_yearly", 200, 12, false],
    ]);
    for (const price of LAUNCH_PRICES) expect(premiumPriceSchema.parse(price)).toEqual(price);
  });
  it("convert the server's centimes to the dirhams the screens show", () => {
    const wire = {
      enabled: true,
      checkoutEnabled: false,
      prices: [
        { code: "plus_monthly", periodMonths: 1, renews: true, priceMinor: 2000, currency: "MAD" },
        {
          code: "plus_yearly",
          periodMonths: 12,
          renews: false,
          priceMinor: 20000,
          currency: "MAD",
        },
      ],
      savingMinor: 4000,
      editions: [],
    };
    expect(premiumStatusWireSchema.parse(wire)).toEqual({
      enabled: true,
      checkoutEnabled: false,
      prices: [...LAUNCH_PRICES],
    });
    const offWire = { ...PREMIUM_STATUS_OFF, savingMinor: null, editions: [] };
    expect(premiumStatusWireSchema.parse(offWire)).toEqual(PREMIUM_STATUS_OFF);
    const halfDirham = { ...wire, prices: [{ ...wire.prices[0], priceMinor: 2050 }] };
    expect(() => premiumStatusWireSchema.parse(halfDirham)).toThrow();
  });
  it("read « switched off » as an answer, not an error", () => {
    expect(premiumStatusSchema.parse(PREMIUM_STATUS_OFF)).toEqual(PREMIUM_STATUS_OFF);
    expect(myPremiumSchema.parse(MY_PREMIUM_OFF)).toEqual(MY_PREMIUM_OFF);
    expect(() => myPremiumSchema.parse({ available: true })).toThrow();
  });
  it("give member features to active, cancelling and grace only", () => {
    const members = PREMIUM_STATES.filter(isMemberState);
    expect(members).toEqual(["active", "cancelling", "grace"]);
  });
});

describe("the mock repository", () => {
  it("answers every scenario in the shape lane B's get_my_premium will", () => {
    for (const scenario of PLUS_SCENARIOS) {
      expect(() => myPremiumSchema.parse(mockMine(scenario, NOW))).not.toThrow();
    }
  });
  it("reads the scenario from ?plus= and ignores anything else", () => {
    expect(scenarioFromSearch("?plus=monthly")).toBe("monthly");
    expect(scenarioFromSearch("?plus=cancelling&x=1")).toBe("cancelling");
    expect(scenarioFromSearch("?plus=free-money")).toBe("none");
    expect(scenarioFromSearch("")).toBe("none");
  });
  it("puts dates relative to now", () => {
    const mine = mockMine("monthly", NOW);
    expect(mine.available && mine.currentPeriodEnd).toBe("2026-10-25T10:00:00.000Z");
  });
  it("serves status, mine and receipts, and answers « soon » to every action", async () => {
    let scenario: PlusScenario = "monthly";
    const repo = new MockPremiumRepository(
      () => scenario,
      () => NOW,
    );
    expect(premiumStatusSchema.parse(await repo.status(context)).prices).toHaveLength(2);
    expect((await repo.mine(context)).available).toBe(true);
    expect(await repo.receipts(context)).toHaveLength(1);
    scenario = "none";
    expect(await repo.receipts(context)).toHaveLength(0);
    expect(await repo.startCheckout("plus_yearly", context)).toEqual({ status: "soon" });
    expect(await repo.cancel(context)).toEqual({ status: "soon" });
    expect(await repo.restore(context)).toEqual({ status: "soon" });
  });
});

describe("derivePremium", () => {
  const status = { enabled: true, checkoutEnabled: false, prices: [...LAUNCH_PRICES] };
  it("is off and member-less while the status says off and the reader is not a member", () => {
    const view = derivePremium(PREMIUM_STATUS_OFF, mockMine("expired", NOW), true);
    expect(view).toMatchObject({ enabled: false, isMember: false, state: "none", periodEnd: null });
  });
  it("is member-less for a signed-out reader, whatever the answer", () => {
    expect(derivePremium(status, mockMine("monthly", NOW), false).isMember).toBe(false);
  });
  it("reads a monthly member with the renewal date", () => {
    const view = derivePremium(status, mockMine("monthly", NOW), true);
    expect(view).toMatchObject({
      enabled: true,
      isMember: true,
      state: "active",
      productCode: "plus_monthly",
      cancelling: false,
    });
    expect(view.periodEnd?.toISOString()).toBe("2026-10-25T10:00:00.000Z");
  });
  it("reads cancelling as a member who will not renew, expired as no member", () => {
    expect(derivePremium(status, mockMine("cancelling", NOW), true)).toMatchObject({
      isMember: true,
      cancelling: true,
    });
    expect(derivePremium(status, mockMine("expired", NOW), true)).toMatchObject({
      isMember: false,
      state: "expired",
    });
  });
  it("never exposes checkout while the status keeps it closed", () => {
    expect(derivePremium(status, undefined, true).checkoutEnabled).toBe(false);
  });
});
